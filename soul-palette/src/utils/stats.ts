import type { Job, Stats, CharacterEquipment } from '../types'

// Lv1→Lv50で約5倍に線形成長
export const calcStat = (base: number, level: number): number => {
  const growthPerLevel = (base * 4) / 49
  return Math.floor(base + growthPerLevel * (level - 1))
}

// 装備・個体値込みの最終ステータス計算
export const calcStats = (
  job: Job,
  level: number,
  equipments: CharacterEquipment[] = [],
  ivs: { hp?: number; atk?: number; def?: number } = {},
): Stats => {
  const stats: Stats = {
    hp:  calcStat(job.base_hp,  level) + (ivs.hp  ?? 0),
    atk: calcStat(job.base_atk, level) + (ivs.atk ?? 0),
    def: calcStat(job.base_def, level) + (ivs.def ?? 0),
    spd: calcStat(job.base_spd, level),
  }

  for (const equip of equipments) {
    const e = equip.user_equipment?.equipment
    if (e) {
      stats.hp  += e.hp_bonus
      stats.atk += e.atk_bonus
      stats.def += e.def_bonus
      stats.spd += e.spd_bonus
    }
  }

  return stats
}

// 次のレベルに必要な経験値（シンプルな線形設計）
export const expToNextLevel = (level: number): number => {
  return level * 100
}
