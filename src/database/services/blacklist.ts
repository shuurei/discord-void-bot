import db from '@/database/db'
import { BlacklistStatus } from '@/database/core/enums'
import { BlacklistCreateManyInput, BlacklistUpdateInput, BlacklistUpdateManyMutationInput } from '../core/models'

class BlacklistService {
    constructor(
        public model: typeof db.blacklist
    ) {}

    // -- Utils -- //
    private _buildDataJoin(dataId: string) {
        return {
            connectOrCreate: {
                where: { id: dataId },
                create: { id: dataId }
            }
        };
    }

    // -- CRUD -- //
    async findById(targetId?: string) {
        return await this.model.findUnique({ where: { targetId } });
    }

    async findByThreadId(threadId?: string) {
        return await this.model.findUnique({ where: { threadId } });
    }

    async add(data: BlacklistCreateManyInput) {
        const {
            targetId,
            authorId,
            cleanerId,
            guildId,
            ...props
        } = data;

        return await this.model.upsert({
            where: { targetId },
            update: {},
            create: {
                ...props,
                guild: this._buildDataJoin(guildId),
                target: this._buildDataJoin(targetId),
                author: this._buildDataJoin(authorId),
                cleaner: cleanerId ? this._buildDataJoin(cleanerId) : {},
            },
        });
    }

    async update(targetId: string, data: { cleanerId?: string } & Omit<BlacklistUpdateInput, 'target' | 'author' | 'cleaner'>) {
        const { cleanerId, ...props } = data;

        return await this.model.update({
            where: { targetId },
            data: {
                ...props,
                cleaner: cleanerId ? this._buildDataJoin(cleanerId) : {},
            }
        });
    }

    async updateState(targetId: string, status: BlacklistStatus) {
        return await this.model.update({
            where: { targetId },
            data: { status }
        });
    }

    async removeByThreadId(threadId: string) {
        return await this.model.delete({
            where: { threadId }
        });
    }
}

export const blacklistService = new BlacklistService(db.blacklist);