import axios from 'axios';

const NITRADO_API_URL = 'https://api.nitrado.net/services';
const NITRADO_API_KEY = process.env.NITRADO_API_KEY;

export const getServiceStatus = async (serviceId: string) => {
    try {
        const response = await axios.get(`${NITRADO_API_URL}/${serviceId}/status`, {
            headers: {
                Authorization: `Bearer ${NITRADO_API_KEY}`
            }
        });
        return response.data;
    } catch (error: any) {
        throw new Error(`Failed to fetch service status: ${error.message}`);
    }
};

export const restartService = async (serviceId: string) => {
    try {
        const response = await axios.post(`${NITRADO_API_URL}/${serviceId}/restart`, {}, {
            headers: {
                Authorization: `Bearer ${NITRADO_API_KEY}`
            }
        });
        return response.data;
    } catch (error: any) {
        throw new Error(`Failed to restart service: ${error.message}`);
    }
};