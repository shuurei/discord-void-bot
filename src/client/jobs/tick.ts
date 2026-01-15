import cron from 'node-cron'
import { jobsLogger } from './index'

import client from '../instance'
import { guildModuleService, memberDailyQuestService, memberService, userService } from '@/database/services'

import { randomNumber, timeElapsedFactor } from '@/utils'
import { channelBlacklistService } from '@/database/services/channel-blacklist'
import { handleMemberCheckLevelUp } from '../handlers/member-check-level-up'
import { handleMemberDailyQuestSync } from '../handlers/member-daily-quest-sync'
import { handleMemberDailyQuestNotify } from '../handlers/member-daily-quest-notify'

jobsLogger.borderBox('🔗 » Tick Job started');

const factor = (condition: any, value = 0) => condition ? value : 0;

cron.schedule('* * * * *', async () => {
    try {
        for (const [userId, session] of client.callSessions.cache) {
            const guild = client.guilds.cache.find((guild) => guild.id === session.guildId);
            if (!guild) return;

            const now = Date.now();
            const elapsed = now - session.timestamp;
            const minutesElapsed = Math.floor(elapsed / (60 * 1000));

            if (minutesElapsed <= 0) continue;

            const guildId = guild.id;

            const [
                userDatabase,
                guildEcoModule,
                guildLevelModule,
                guildQuestModule,
                channelScopeBlacklist
            ] = await Promise.all([
                userService.findById(userId),
                guildModuleService.findById({ guildId, moduleName: 'eco' }),
                guildModuleService.findById({ guildId, moduleName: 'level' }),
                guildModuleService.findById({ guildId, moduleName: 'quest' }),
                channelBlacklistService.findMany({ guildId, channelId: session.channelId })
            ]);

            const member = guild.members.cache.get(userId);

            const guildBoostElapsedProgress = timeElapsedFactor(member?.premiumSince, 7);
            const tagBoostElapsedProgress = timeElapsedFactor(userDatabase?.tagAssignedAt, 14);

            if (guildEcoModule?.isActive && !channelScopeBlacklist.ECONOMY) {
                const { settings } = guildEcoModule

                if (settings?.guildPointsFromCallEnabled) {
                    if ((minutesElapsed % settings.callGainIntervalMinutes) === 0) {
                        const maxGain = settings.callMaxGain;
                        const minGain = settings.callMinGain;

                        // Penalty
                        const callPrivateFactor = factor(session.flags.isPrivate, settings.callPrivatePenalty);
                        const muteFactor = factor(session.flags.isMuted, settings.callMutedPenalty);
                        const deafFactor = factor(session.flags.isDeaf, settings.callDeafPenalty);

                        const penaltyFactor = deafFactor + muteFactor + callPrivateFactor;

                        // Bonus
                        const guildBoostFactor = factor(settings.boosterFactor, guildBoostElapsedProgress * settings.boosterFactor);
                        const tagBoostFactor = factor(settings.tagSupporterFactor, tagBoostElapsedProgress * settings.tagSupporterFactor);
                        const cameraBoostFactor = factor(session.flags.hasCamera, settings.callCameraBonus);
                        const streamBoostFactor = factor(session.flags.isStreaming, settings.callStreamBonus);

                        const bonusFactor = tagBoostFactor + guildBoostFactor + cameraBoostFactor + streamBoostFactor;

                        const randomCoins = Math.floor(randomNumber(minGain, maxGain) * (1 + (bonusFactor)) * (1 - (penaltyFactor)));

                        if (randomCoins > 0) {
                            await memberService.addGuildCoins({
                                userId,
                                guildId,
                            }, randomCoins);
                        }
                    }
                }
            }

            if (guildLevelModule?.isActive && !channelScopeBlacklist.LEVEL) {
                const { settings } = guildLevelModule;

                if (settings?.isXpFromMessageEnabled) {
                    if ((minutesElapsed % settings.callGainIntervalMinutes) === 0) {
                        const maxGain = 250;
                        const minGain = 150;

                        // Penalty
                        const callPrivateFactor = factor(session.flags.isPrivate, settings.callPrivatePenalty);
                        const muteFactor = factor(session.flags.isMuted, settings.callMutedPenalty);
                        const deafFactor = factor(session.flags.isDeaf, settings.callDeafPenalty);

                        const penaltyFactor = deafFactor + muteFactor + callPrivateFactor;

                        // Bonus
                        const guildBoostFactor = factor(settings.boosterFactor, guildBoostElapsedProgress * settings.boosterFactor);
                        const tagBoostFactor = factor(settings.tagSupporterFactor, tagBoostElapsedProgress * settings.tagSupporterFactor);
                        const cameraBoostFactor = factor(session.flags.hasCamera, settings.callCameraBonus);
                        const streamBoostFactor = factor(session.flags.isStreaming, settings.callStreamBonus);

                        const bonusFactor =
                            tagBoostFactor +
                            guildBoostFactor +
                            cameraBoostFactor +
                            streamBoostFactor;

                        const randomXP = Math.floor(
                            randomNumber(minGain, maxGain) * (1 + bonusFactor) * (1 - penaltyFactor)
                        );

                        if (randomXP > 0) {
                            await handleMemberCheckLevelUp({
                                member,
                                channel: guild.channels.cache.get(session.channelId),
                                xpGain: randomXP
                            });
                        }
                    }
                }
            }

            if (guildQuestModule?.isActive && !channelScopeBlacklist.QUEST && !(session.flags.isDeaf || session.flags.isMuted)) {
                const quest = await handleMemberDailyQuestSync({
                    userId,
                    guildId
                }, session.guildLocale);

                if (quest && !quest.isClaimed && quest.voiceMinutesTarget && (quest.voiceMinutesTarget != quest.voiceMinutesProgress)) {
                    const newQuest = await memberDailyQuestService.updateOrCreate({
                        userId,
                        guildId,
                    }, {
                        voiceMinutesProgress: quest.voiceMinutesProgress + 1
                    });

                    await handleMemberDailyQuestNotify({
                        userId,
                        channel: guild.channels.cache.get(session.channelId),
                        oldQuest: quest,
                        newQuest
                    });
                }
            }
        }

        // Clear Spam Cache
        if (client.spamBuffer.size > 0) {
            client.spamBuffer.clear();
        }
    } catch (ex) {
        return jobsLogger.error(ex);
    }
});
