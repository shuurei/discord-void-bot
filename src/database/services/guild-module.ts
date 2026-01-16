import db from '@/database/db'

import {
    defaultGuildModuleSettings,
    GuildModuleKeys,
    GuildModuleName,
    GuildModuleSetting
} from '@/database/utils/default-guild-settings'

import {
    GuildModuleCreateInput,
    GuildModuleModel,
    GuildModuleUpdateInput
} from '@/database/core/models'

interface GuildModuleWhere<ModuleName extends GuildModuleName = GuildModuleName> {
    guildId: string;
    moduleName: ModuleName;
}

export type GuildModuleSettings<ModuleName extends GuildModuleName> = {
    settings?: GuildModuleSetting<ModuleName>
}

export type GuildModuleCreateInputWithoutGuildAndName<ModuleName extends GuildModuleName> = Omit<
    GuildModuleCreateInput,
    'settings' | 'guild' | 'name'
> & GuildModuleSettings<ModuleName>;

export type GuildModuleUpdateInputWithoutGuildAndName<ModuleName extends GuildModuleName> = Omit<
    GuildModuleUpdateInput,
    'settings' | 'guild' | 'name'
> & GuildModuleSettings<ModuleName>;

class GuildModuleService {
    constructor(public model: typeof db.guildModule) { }

    // -- Utils -- //
    private _buildWhere({ guildId, moduleName }: GuildModuleWhere) {
        return {
            guildId_name: {
                guildId,
                name: moduleName
            }
        }
    }

    private _normalizeSettings<ModuleName extends GuildModuleName>(
        moduleName: ModuleName,
        oldSettings?: Partial<GuildModuleSettings<ModuleName>>,
        newSettings?: Partial<GuildModuleSettings<ModuleName>>
    ): GuildModuleSettings<ModuleName> {
        const defaultSettings = defaultGuildModuleSettings[moduleName];

        const merged = {
            ...defaultSettings,
            ...oldSettings,
            ...newSettings
        };

        const allowedKeys = Object.keys(defaultSettings);

        return Object.fromEntries(
            Object.entries(merged).filter(([key]) => allowedKeys.includes(key))
        ) as GuildModuleSettings<ModuleName>;
    }

    // -- CRUD -- //
    async findById<ModuleName extends GuildModuleName>(where: GuildModuleWhere<ModuleName>) {
        return await this.model.findUnique({
            where: this._buildWhere(where)
        }) as (Omit<GuildModuleModel, 'settings'> & GuildModuleSettings<ModuleName>) | null;
    }

    async findOrCreate<ModuleName extends GuildModuleName>(
        where: GuildModuleWhere<ModuleName>,
        data?: Partial<GuildModuleCreateInputWithoutGuildAndName<ModuleName>>
    ) {
        const settings = this._normalizeSettings<ModuleName>(
            where.moduleName,
            {},
            data?.settings as any
        );

        return await this.model.upsert({
            where: this._buildWhere(where),
            update: {},
            create: {
                ...data,
                settings,
                guild: {
                    connectOrCreate: {
                        where: { id: where.guildId },
                        create: { id: where.guildId }
                    }
                },
                name: where.moduleName
            }
        }) as (Omit<GuildModuleModel, 'settings'> & Required<GuildModuleSettings<ModuleName>>);
    }

    async createOrUpdate<ModuleName extends GuildModuleName>(
        where: GuildModuleWhere<ModuleName>,
        data?: Partial<GuildModuleCreateInputWithoutGuildAndName<ModuleName>>
    ) {
        const existing = await this.findOrCreate<ModuleName>(where);

        const settings = this._normalizeSettings(
            where.moduleName,
            existing.settings as any,
            data?.settings as any
        );

        return await this.model.upsert({
            where: this._buildWhere(where),
            update: {
                ...data,
                settings
            },
            create: {
                ...data,
                settings,
                guild: {
                    connectOrCreate: {
                        where: { id: where.guildId },
                        create: { id: where.guildId }
                    }
                },
                name: where.moduleName
            }
        }) as (Omit<GuildModuleModel, 'settings'> & Required<GuildModuleSettings<ModuleName>>);
    }

    async create<ModuleName extends GuildModuleName>(
        where: GuildModuleWhere,
        data?: GuildModuleCreateInputWithoutGuildAndName<ModuleName>
    ) {
        return await this.model.create({
            data: {
                ...data,
                name: where.moduleName,
                settings: defaultGuildModuleSettings[where.moduleName],
                guild: {
                    connectOrCreate: {
                        where: { id: where.guildId },
                        create: { id: where.guildId }
                    }
                },
            }
        }) as (Omit<GuildModuleModel, 'settings'> & Required<GuildModuleSettings<ModuleName>>);
    }

    async update<ModuleName extends GuildModuleName>(
        where: GuildModuleWhere,
        data: GuildModuleUpdateInputWithoutGuildAndName<ModuleName>
    ) {
        return await this.model.update({
            where: this._buildWhere(where),
            data: data as any
        }) as (Omit<GuildModuleModel, 'settings'> & Required<GuildModuleSettings<ModuleName>>);
    }

    async delete(where: GuildModuleWhere) {
        return await this.model.delete({
            where: this._buildWhere(where)
        });
    }

    // --  -- //
    async areEnabled<ModuleName extends GuildModuleName>(
        guildId: string,
        moduleNames: ModuleName | ModuleName[],
        mode: 'some' | 'every' = 'some'
    ) {
        const names = Array.isArray(moduleNames) ? moduleNames : [moduleNames];

        const modules = await Promise.all(
            names.map((name) => this.findOrCreate({ guildId, moduleName: name }))
        );

        if (mode === 'every') return modules.every(m => m.isActive);
        return modules.some(m => m.isActive);
    }

    async toggleEnabled<ModuleName extends GuildModuleName>(where: GuildModuleWhere<ModuleName>) {
        const current = await this.findOrCreate(where);
        return await this.createOrUpdate<ModuleName>(where, {
            isActive: !current.isActive
        });
    }

    async resetSettings<ModuleName extends GuildModuleName>(where: GuildModuleWhere<ModuleName>) {
        const current = await this.findById<ModuleName>(where);
        if (!current) {
            return await this.create<ModuleName>(where);
        }

        return await this.createOrUpdate<ModuleName>(where, {
            settings: defaultGuildModuleSettings[where.moduleName]
        });
    }

    // -- Field -- //
    async areSettingFieldEnabled<ModuleName extends GuildModuleName>(
        guildId: string,
        moduleName: ModuleName,
        fields: GuildModuleKeys<ModuleName> | GuildModuleKeys<ModuleName>[],
        mode: 'some' | 'every' = 'some'
    ) {
        const names = Array.isArray(fields) ? fields : [fields];
        const module = await this.findOrCreate<ModuleName>({ guildId, moduleName });

        const results = names.map((key) => module.settings[key]);
        if (mode === 'every') return results.every(Boolean);
        return results.some(Boolean);
    }

    async updateSettingField<ModuleName extends GuildModuleName>(
        where: GuildModuleWhere<ModuleName>,
        field: GuildModuleKeys<ModuleName>,
        value: string | number | boolean
    ) {
        return await this.createOrUpdate<ModuleName>(where, {
            settings: {
                [field]: value
            } as any
        });
    }

    async toggleSettingField<ModuleName extends GuildModuleName>(
        where: GuildModuleWhere<ModuleName>,
        field: GuildModuleKeys<ModuleName>,
    ) {
        const current = await this.findOrCreate<ModuleName>(where);
        const currentField = current.settings[field];

        if (typeof currentField !== 'boolean') {
            return current;
        }

        return await this.updateSettingField<ModuleName>(where, field, !current.settings[field]);
    }

    async resetSettingField<ModuleName extends GuildModuleName>(
        where: GuildModuleWhere<ModuleName>,
        field: GuildModuleKeys<ModuleName>,
    ) {
        return await this.updateSettingField<ModuleName>(
            where,
            field,
            defaultGuildModuleSettings[where.moduleName][field] as any
        );
    }
}

export const guildModuleService = new GuildModuleService(db.guildModule);