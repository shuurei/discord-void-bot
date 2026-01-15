import logger from '@/utils/logger'

export const jobsLogger = logger.use({
    prefix: (c) => c.white(`[${c.cyanBright(`JOBS`)}] <🕛>`)
});

export const startAllJobs = async () => {
    logger.topBorderBox('jobs Loading ⏳');
    await import('./tick.js');
    logger.bottomBorderBox('✅ Jobs loaded');

    console.log();
}

export default {
    startAllJobs,
    logger
}
