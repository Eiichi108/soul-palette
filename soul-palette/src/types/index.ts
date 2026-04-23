export type Job = {
  id: number
  name: string
  base_hp: number
  base_atk: number
  base_def: number
  base_spd: number
  description: string
}

export type Skill = {
  id: number
  job_id: number
  name: string
  type: '攻撃' | 'パッシブ' | 'バフ' | 'デバフ' | 'ヒール'
  power: number
  description: string
}

export type Character = {
  id: string
  user_id: string
  name: string
  job_id: number
  level: number
  max_level: number
  exp: number
  iv_hp: number
  iv_atk: number
  iv_def: number
  created_at: string
  job?: Job
  skills?: Skill[]
}

export type Equipment = {
  id: number
  name: string
  type: 'weapon' | 'armor' | 'accessory'
  atk_bonus: number
  def_bonus: number
  hp_bonus: number
  spd_bonus: number
  rarity: string
  description?: string
}

export type UserEquipment = {
  id: string
  user_id: string
  equipment_id: number
  obtained_at: string
  equipment?: Equipment
}

export type CharacterEquipment = {
  id: string
  character_id: string
  user_equipment_id: string
  slot: 'weapon' | 'armor' | 'accessory'
  user_equipment?: UserEquipment
}

export type Stats = {
  hp: number
  atk: number
  def: number
  spd: number
}

export type UserProfile = {
  id: string
  username?: string
  gold: number
  created_at: string
}

export type Quest = {
  id: number
  title: string
  description?: string
  required_level: number
  reward_exp: number
  reward_gold: number
  order_index: number
}

export type UserQuest = {
  id: string
  user_id: string
  quest_id: number
  status: 'available' | 'completed'
  cleared_at?: string
  quest?: Quest
}

// ===== バトル用型 =====

export type StatusEffectType = 'poison' | 'paralysis' | 'stun' | 'spd_down'

export type StatusEffect = {
  type: StatusEffectType
  value?: number
  turnsLeft?: number
}

export type BattleCharacter = {
  id: string
  name: string
  jobId: number
  team: 'player' | 'cpu'
  currentHp: number
  maxHp: number
  atk: number
  def: number
  spd: number
  shield: number
  skills: Skill[]
  statusEffects: StatusEffect[]
  isAlive: boolean
  hasUsedKiai: boolean
  sealedPassives: boolean
}

export type CharSnapshot = {
  id: string
  currentHp: number
  maxHp: number
  shield: number
  isAlive: boolean
  statusEffects: StatusEffect[]
}

export type BattleLogEntry = {
  turn: number
  message: string
  type: 'action' | 'status' | 'result'
  snapshot: CharSnapshot[]
}

export type BattleResult = {
  winner: 'player' | 'cpu' | 'draw'
  turns: number
  logs: BattleLogEntry[]
  finalPlayerTeam: BattleCharacter[]
  finalCpuTeam: BattleCharacter[]
}

export type BattleLog = {
  id: string
  user_id: string
  quest_id?: number
  result: 'win' | 'lose' | 'draw'
  reward_exp: number
  reward_gold: number
  created_at: string
}
