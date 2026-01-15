import cron from 'node-cron'
import { jobsLogger } from './index'

jobsLogger.borderBox('🔗 » Weekly Job started');

cron.schedule('0 0 * * Monday', async () => {
    try {
        
    } catch (ex) {
        jobsLogger.error(ex);
    }
});