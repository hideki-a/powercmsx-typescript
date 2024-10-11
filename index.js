#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs';
import { program } from 'commander';
import uppercamelcase from 'uppercamelcase';
import APIClient from './api_client.js';
import { auditTypeCols, revisionTypeCols, statusTypeCols, dateTypeCols } from './management_cols.js';

// 引数の処理
let model;
program
    .argument('<target_model>')
    .option('--cols <optionValue>')
    .option('--name <optionValue>')
    .option('--no-ssl-verify')
    .action((target_model) => {
        model = target_model;
    });
program.parse();
const options = program.opts();
const outputCols = options.cols?.split(',');

if (!options.sslVerify) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// AuditType等既に定義があるもののマッピング
const typeMappings = [
    { cols: auditTypeCols, type: 'AuditType' },
    { cols: revisionTypeCols, type: 'RevisionType' },
    { cols: statusTypeCols, type: 'StatusType' },
    { cols: dateTypeCols, type: 'DateType' }
];

function isSingleSelectionRelation(column, editProperties) {
    if (editProperties[column] && editProperties[column].indexOf('relation') !== -1) {
        return true;
    }

    return false;
}

// カラムに応じた型の決定
function getType(type, column, relations, editProperties, isRelationAddSuffix) {
    if (type === 'int') {
        if (isSingleSelectionRelation(column, editProperties)) {
            const properties = editProperties[column].split(':');
            if (isRelationAddSuffix) {
                return uppercamelcase(properties[1]) + 'Summary';
            }
            return uppercamelcase(properties[1]);
        } else {
            return 'number';
        }
    } else if (['double', 'decimal'].includes(type)) {
        return 'number';
    } else if (type === 'tinyint') {
        return 'boolean';
    } else if (type === 'blob') {
        return 'Binary';
    } else if (type === 'relation') {
        if (isRelationAddSuffix) {
            return uppercamelcase(relations[column]) + 'Summary[]';
        }
        return uppercamelcase(relations[column]) + '[]';
    }

    return 'string';
}

// カラム定義生成
async function generateDefinition(writeStream, model, outputCols = null, isRelationSomeColumn = false) {
    const managementTypes = [];
    const relationModels = [];

    // カラム定義の取得
    const scheme = await apiClient.getScheme(model);
    const relations = scheme.relations;
    const editProperties = scheme.edit_properties;

    // カラム定義から出力するカラムを抽出
    let columns = {};
    if (outputCols) {
        for (const key in scheme.column_defs) {
            if (outputCols.includes(key)) {
                columns[key] = scheme.column_defs[key];
            }
        }

        // auditTypeCols等既に定義があるものは定義を利用する
        typeMappings.forEach(({ cols, type }) => {
            if (cols.every(key => columns.hasOwnProperty(key))) {
                managementTypes.push(type);
                cols.forEach(col => delete columns[col]);
            }
        });
    } else if (isRelationSomeColumn) {
        for (const key in scheme.column_defs) {
            if (key === 'id' || key === 'workspace_id' || scheme.primary === key || scheme.column_defs[key].type === 'blob') {
                columns[key] = scheme.column_defs[key];
            }
        }
    } else {
        columns = scheme.column_defs;
    }

    // 書き込み処理
    const writeData = (column, columns, isRelationAddSuffix) => {
        writeStream.write(`  ${column}: ${getType(columns[column].type, column, relations, editProperties, isRelationAddSuffix)};\n`);
    };

    // カラム毎に型を判断して出力
    for (const column in columns) {
        if (isRelationSomeColumn) {
            writeData(column, columns);
        } else if (outputCols) {
            if (outputCols.includes(column)) {
                if (columns[column].type === 'int') {
                    if (isSingleSelectionRelation(column, editProperties)) {
                        relationModels.push(editProperties[column].split(':')[1]);
                        writeData(column, columns, true);
                    } else {
                        writeData(column, columns);
                    }
                } else if (columns[column].type === 'relation') {
                    relationModels.push(relations[column]);
                    writeData(column, columns, true);
                } else {
                    writeData(column, columns);
                }
            }
        } else {
            const foundType = typeMappings.find(({ cols }) => cols.includes(column));
            if (foundType) {
                // AuditType等既に定義があるもの
                if (!managementTypes.includes(foundType.type)) {
                    managementTypes.push(foundType.type);
                }
            } else {
                writeData(column, columns);
            }
        }
    }

    writeStream.write("  Permalink?: string;\n");
    if (scheme.hierarchy) {
        writeStream.write("  Path: string;\n");
    }

    return { relationModels, managementTypes };
}

// 型定義ファイルの処理
function writeDefinition(fileName, model, outputCols, isRelationSomeColumn = false) {
    return new Promise(async (resolve) => {
        const writeStream = fs.createWriteStream(fileName, { flags: 'a' });

        // 定義名等
        if (isRelationSomeColumn) {
            writeStream.write(`\ntype ${uppercamelcase(model)}Summary = {\n`);
        } else {
            writeStream.write(`type ${uppercamelcase(model)} = {\n`);
        }

        // カラムデータの出力
        const { relationModels, managementTypes } = await generateDefinition(writeStream, model, outputCols, isRelationSomeColumn);
        writeStream.write(`}`);

        // AuditType等既に定義があるものを出力
        if (managementTypes.length) {
            writeStream.write(' & ' + managementTypes.join(' & '));
        }

        // 終端
        writeStream.write(";\n");
        writeStream.end();

        writeStream.on('finish', () => {
            writeStream.close();
            resolve(relationModels);
        })
    });
}

function existFile(file) {
    try {
        fs.statSync(file);
        return true
    } catch(err) {
        return false;
    }
}

const apiClient = new APIClient();
await apiClient.init();

const fileName = process.cwd() + '/' + (options.name ? `${options.name}.ts` : `${uppercamelcase(model)}.ts`);
if (existFile(fileName)) {
    fs.unlinkSync(fileName);
}
const relationModels = await writeDefinition(fileName, model, outputCols);

if (relationModels.length) {
    for (const model of relationModels) {
        await writeDefinition(fileName, model, null, true);
    };
}

