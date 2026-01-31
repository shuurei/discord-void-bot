import db from '@/database/db'

import { blacklistService } from './blacklist'

interface BlacklistDerogationWhere {
    userId: string;
    guildId: string;
}

class BlacklistDerogationService {
    constructor(
        public model: typeof db.blacklistDerogation
    ) { }

    // -- Utils -- //
    private _buildWhere(where: BlacklistDerogationWhere) {
        return { userId_guildId: where }
    }

    // -- CRUD -- //
    async findById(where: BlacklistDerogationWhere) {
        return await this.model.findUnique({
            where: this._buildWhere(where),
            include: {
                blacklist: true
            }
        });
    }

    async authorize(where: BlacklistDerogationWhere) {
        const { userId } = where;

        const blacklist = await blacklistService.findById(userId);
        if (!blacklist) return;

        let derogation = await this.findById(where);
        if (!derogation) {
            derogation = await this.model.create({
                data: {
                    ...where,
                    authorized: true,
                },
                include: {
                    blacklist: true
                }
            });
        }

        return derogation;
    }

    async unauthorize(where: BlacklistDerogationWhere) {
        const derogation = await this.findById(where);
        if (derogation) {
            const data = await this.model.delete({
                where: this._buildWhere(where),
                include: {
                    blacklist: true
                }
            });

            return {
                ...data,
                authorized: false
            }
        }
    }
}

export const blacklistDerogationService = new BlacklistDerogationService(db.blacklistDerogation);