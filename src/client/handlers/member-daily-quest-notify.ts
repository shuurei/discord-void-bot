import { Channel } from 'discord.js'
import { MemberDailyQuestModel } from '@/database/core/models'

export async function handleMemberDailyQuestNotify({
    userId,
    channel,
    oldQuest,
    newQuest
}: {
    userId: string;
    channel?: Channel | null;
    oldQuest: MemberDailyQuestModel,
    newQuest: MemberDailyQuestModel
}) {
    if (oldQuest.isClaimed || !channel?.isSendable()) return;

    const messageJustCompleted = oldQuest.messagesSentTarget
        ? oldQuest.messagesSentProgress < oldQuest.messagesSentTarget &&
        newQuest.messagesSentProgress >= newQuest.messagesSentTarget!
        : false;

    const voiceJustCompleted = oldQuest.voiceMinutesTarget
        ? oldQuest.voiceMinutesProgress < oldQuest.voiceMinutesTarget &&
        newQuest.voiceMinutesProgress >= newQuest.voiceMinutesTarget!
        : false;

    const isMessageCompleted = newQuest.messagesSentTarget
        ? newQuest.messagesSentProgress >= newQuest.messagesSentTarget!
        : true;

    const isVoiceCompleted = newQuest.voiceMinutesTarget
        ? newQuest.voiceMinutesProgress >= newQuest.voiceMinutesTarget!
        : true;

    if (isMessageCompleted && isVoiceCompleted) {
        await channel.send(`<@${userId}> **Quête quotidienne complétée !** Récompense disponible 🎁`);
    } else if (voiceJustCompleted) {
        await channel.send(`<@${userId}> **Quête quotidienne** 🎯 — Objectif vocal complété (**1 / 2**)`);
    } else if (messageJustCompleted) {
        await channel.send(`<@${userId}> **Quête quotidienne** 🎯 — Objectif message complété (**1 / 2**)`);
    }
}