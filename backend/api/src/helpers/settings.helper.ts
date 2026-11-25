import { prisma } from '../config/database';
import { SETTING_DEFAULTS, type SettingKey } from '../constants/app.constants';

/** Reads an admin-editable platform setting, falling back to its default. */
export async function getSetting<K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
  const s = await prisma.platformSetting.findUnique({ where: { key } });
  return (s?.value as (typeof SETTING_DEFAULTS)[K]) ?? SETTING_DEFAULTS[key];
}
