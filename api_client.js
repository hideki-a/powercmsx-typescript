import 'dotenv/config';
import PTRESTfulAPIClient from 'pt-restful-api-client';

export default class APIClient {
    #client;
    #token;

    async getScheme(model) {
        const response = await this.client.getScheme(model, this.token, 0);
        if (response.status === 403) {
            const json = await response.json();
            throw new Error("An error has occurred: " + json.message);
        } else if (response.status !== 200) {
            throw new Error('An error has occurred.');
        }

        const json = await response.json();
        return json;
    }

    async init() {
        const client = new PTRESTfulAPIClient(process.env.API_URL, process.env.API_VERSION);
        const authResponse = await client.authentication(process.env.CMS_USER, process.env.CMS_PASSWORD);
        if (authResponse.status === 404) {
            console.error('PowerCMS X API Not Found.');
            return;
        } else if (authResponse.status === 401) {
            console.error('PowerCMS X Authentication Failed.');
            return;
        } else if (authResponse.status !== 200) {
            console.error('An error has occurred.');
            return;
        }

        const authData = await authResponse.json();
        const token = authData.access_token;

        this.client = client;
        this.token = token;
    }
}
