// preset-cards 兼容层：便捷方案联动 preset-cards profile。
// 自包含模块：枚举可选 profile、渲染下拉选项、执行联动。
// 与 index.js 同目录，相对导入路径一致（ST / TauriTavern 均按同源路径服务）。

import { openai_setting_names, openai_settings } from '../../../openai.js';

const VALUE_PREFIX = 'pc::';

/** 规范化方案数据里的 presetCards 字段（缺失/畸形 → 空字段）。 */
export function normalizePresetCards(raw) {
    return {
        preset: String(raw?.preset || '').trim().slice(0, 500),
        profileId: String(raw?.profileId || '').trim().slice(0, 500),
    };
}

/**
 * 枚举可选 preset-cards profiles：{ preset, profileId, profileName }[]。
 * 优先 window.presetCards 公共 API；API 缺失（旧版 preset-cards）时回退直读预设扩展数据。
 */
export function presetCardsChoices() {
    const choices = [];
    const addChoice = (preset, profile) => {
        if (typeof preset !== 'string' || !preset || !profile || profile.id === undefined || profile.id === null) return;
        choices.push({
            preset,
            profileId: String(profile.id),
            profileName: String(profile?.name || profile.id),
        });
    };
    const api = globalThis.presetCards;
    if (api && typeof api.listPresets === 'function' && typeof api.getProfiles === 'function') {
        try {
            for (const name of api.listPresets() || []) {
                for (const profile of api.getProfiles(name) || []) addChoice(name, profile);
            }
        } catch {
            // API 异常时回退直读
        }
    }
    if (choices.length === 0) {
        for (const [name, idx] of Object.entries(openai_setting_names || {})) {
            const profiles = openai_settings?.[idx]?.extensions?.preset_cards?.profiles;
            if (!Array.isArray(profiles)) continue;
            for (const profile of profiles) addChoice(name, profile);
        }
    }
    return choices;
}

/** 下拉 value 编码（'::' 分隔，配合 lastIndexOf 解析；预设名含 '::' 亦安全）。 */
export function presetCardsValue(preset, profileId) {
    return `${VALUE_PREFIX}${preset}::${profileId}`;
}

/** 解析下拉 value → { preset, profileId }；非 preset-cards 值返回 null。 */
export function parsePresetCardsValue(value) {
    if (typeof value !== 'string' || !value.startsWith(VALUE_PREFIX)) return null;
    const raw = value.slice(VALUE_PREFIX.length);
    const index = raw.lastIndexOf('::');
    if (index <= 0) return null;
    return { preset: raw.slice(0, index), profileId: raw.slice(index + 2) };
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
}

/** 生成 preset-cards profile 下拉选项（按预设分组；无可用 profile 或未安装时返回空串）。 */
export function presetCardsOptionsHtml(selectedPreset = '', selectedProfileId = '') {
    const choices = presetCardsChoices();
    if (choices.length === 0) return '';
    const selectedValue = selectedPreset && selectedProfileId
        ? presetCardsValue(selectedPreset, selectedProfileId)
        : '';
    const groups = new Map();
    for (const choice of choices) {
        if (!groups.has(choice.preset)) groups.set(choice.preset, []);
        groups.get(choice.preset).push(choice);
    }
    const html = [];
    for (const [preset, items] of groups) {
        const options = items.map(choice => {
            const value = presetCardsValue(choice.preset, choice.profileId);
            return `<option value="${escapeHtml(value)}"${value === selectedValue ? ' selected' : ''}>${escapeHtml(choice.profileName)}</option>`;
        }).join('');
        html.push(`<optgroup label="preset-cards · ${escapeHtml(preset)}">${options}</optgroup>`);
    }
    return ['<option value="">— 不加载 preset-cards profile —</option>', ...html].join('');
}

/**
 * 执行 preset-cards 联动：把 profile 应用到其预设（存储态），随后由调用方统一切换活动预设。
 * 返回 true（成功）| false（加载失败）| 'missing'（未安装 preset-cards 或无 window API）。
 */
export async function applyPresetCardsProfile(preset, profileId) {
    const api = globalThis.presetCards;
    if (!api || typeof api.loadProfile !== 'function') return 'missing';
    try {
        return (await api.loadProfile(preset, profileId)) ? true : false;
    } catch {
        return false;
    }
}
