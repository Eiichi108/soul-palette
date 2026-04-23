import type { BattleCharacter, BattleLogEntry, BattleResult, CharSnapshot, Job, Skill } from '../types'
import { calcDamage, calcHeal, calcStats, getEffectiveSpd, hasStatus, addStatus } from './battle'

// ===== ヘルパー =====

type PushLog = (msg: string, type?: 'action' | 'status' | 'result') => void

const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

const randomAliveEnemy = (actor: BattleCharacter, all: BattleCharacter[]) =>
  all.filter(c => c.isAlive && c.team !== actor.team)[
    Math.floor(Math.random() * all.filter(c => c.isAlive && c.team !== actor.team).length)
  ] ?? null

const lowestHpEnemy = (actor: BattleCharacter, all: BattleCharacter[]) =>
  all.filter(c => c.isAlive && c.team !== actor.team)
    .reduce((m, c) => c.currentHp < m.currentHp ? c : m, all.filter(c => c.isAlive && c.team !== actor.team)[0]) ?? null

const lowestHpAlly = (actor: BattleCharacter, all: BattleCharacter[]) =>
  all.filter(c => c.isAlive && c.team === actor.team)
    .reduce((m, c) => c.currentHp < m.currentHp ? c : m, all.filter(c => c.isAlive && c.team === actor.team)[0]) ?? null

// かばう判定：targetがチーム最低HPなら別の戦士がかばう
const findKabauChar = (target: BattleCharacter, all: BattleCharacter[]): BattleCharacter | null => {
  const team = all.filter(c => c.isAlive && c.team === target.team)
  if (team.length < 2) return null
  const lowest = team.reduce((m, c) => c.currentHp < m.currentHp ? c : m)
  if (lowest.id !== target.id) return null
  return team.find(c => c.id !== target.id && !c.sealedPassives && c.skills.some(s => s.id === 103)) ?? null
}

// ===== ダメージ適用 =====

function applyDmg(
  actor: BattleCharacter,
  target: BattleCharacter,
  power: number,
  all: BattleCharacter[],
  forceCrit: boolean,
  push: PushLog,
  isAoe = false,
): void {
  // 見切り（305）：AoE を 50% で無効化
  if (isAoe && !target.sealedPassives && target.skills.some(s => s.id === 305) && Math.random() < 0.5) {
    push(`${target.name}は見切った！`)
    return
  }
  // 緊急回避（408）：HP50%以下で30%回避
  if (!target.sealedPassives && target.skills.some(s => s.id === 408) &&
      target.currentHp / target.maxHp <= 0.5 && Math.random() < 0.3) {
    push(`${target.name}は緊急回避！`)
    return
  }
  // かばう（103）
  let t = target
  const kabau = findKabauChar(target, all)
  if (kabau) { t = kabau; push(`${kabau.name}が${target.name}をかばった！`) }

  // 集中（304）: 威力+20
  const p = power + (!actor.sealedPassives && actor.skills.some(s => s.id === 304) ? 20 : 0)

  // 魔結界（203）: 実質DEF 25% 増
  const def = t.def * (!t.sealedPassives && t.skills.some(s => s.id === 203) ? 1.25 : 1)

  // クリティカル判定
  let crit = forceCrit
  if (!crit) {
    let rate = 0.05
    if (!actor.sealedPassives && actor.skills.some(s => s.id === 406)) rate += 0.30
    crit = Math.random() < rate
  }

  let dmg = calcDamage(p, actor.atk, def)
  if (crit) { dmg = Math.floor(dmg * 1.5); push(`クリティカル！`) }

  // シールド吸収
  if (t.shield > 0) {
    const abs = Math.min(t.shield, dmg)
    t.shield -= abs; dmg -= abs
    if (abs > 0) push(`${t.name}のシールドが${abs}吸収！`)
  }
  t.currentHp -= dmg
  push(`${t.name}に${dmg}ダメージ！`)

  // 気合い（107）
  if (t.currentHp <= 0 && !t.hasUsedKiai && !t.sealedPassives && t.skills.some(s => s.id === 107)) {
    t.currentHp = 1; t.hasUsedKiai = true
    push(`${t.name}は気合いで耐えた！`)
  } else if (t.currentHp <= 0) {
    t.currentHp = 0; t.isAlive = false
    push(`${t.name}は倒れた！`)
  }

  if (!t.isAlive) return

  // 反撃（106）/ カウンター（303）：30%で反撃
  if (!t.sealedPassives && t.skills.some(s => s.id === 106 || s.id === 303) && Math.random() < 0.3) {
    const cp = t.skills.find(s => s.id === 106 || s.id === 303)?.power ?? 80
    const cdmg = calcDamage(cp, t.atk, actor.def)
    actor.currentHp -= cdmg
    push(`${t.name}が反撃！${actor.name}に${cdmg}ダメージ！`)
    if (actor.currentHp <= 0) { actor.currentHp = 0; actor.isAlive = false; push(`${actor.name}は倒れた！`) }
  }
  if (!actor.isAlive) return

  // 狩人（407）：状態異常の敵に追加ダメージ
  if (!actor.sealedPassives && actor.skills.some(s => s.id === 407) && t.statusEffects.length > 0) {
    const bd = Math.floor(t.maxHp * 0.10)
    t.currentHp -= bd
    push(`狩人！${t.name}にさらに${bd}ダメージ！`)
    if (t.currentHp <= 0) { t.currentHp = 0; t.isAlive = false; push(`${t.name}は倒れた！`) }
  }

  // 電撃矢（405）：追加10ダメージ＋20%麻痺
  if (!actor.sealedPassives && actor.skills.some(s => s.id === 405) && t.isAlive) {
    t.currentHp -= 10
    push(`電撃矢！${t.name}にさらに10ダメージ！`)
    if (Math.random() < 0.2) { addStatus(t, { type: 'paralysis' }); push(`${t.name}は麻痺した！`) }
    if (t.currentHp <= 0) { t.currentHp = 0; t.isAlive = false; push(`${t.name}は倒れた！`) }
  }
}

// ===== スキル実行 =====

function execSkill(actor: BattleCharacter, skill: Skill, all: BattleCharacter[], push: PushLog): void {
  push(`【${actor.name}】${skill.name}！`)
  const enemies = all.filter(c => c.isAlive && c.team !== actor.team)

  switch (skill.id) {
    case 101: { // 強襲：味方戦士数分攻撃
      const n = all.filter(c => c.isAlive && c.team === actor.team && c.jobId === 1).length
      for (let i = 0; i < n; i++) { const t = randomAliveEnemy(actor, all); if (t) applyDmg(actor, t, skill.power, all, false, push) }
      break
    }
    case 102: case 302: { // ２連撃 / 連打
      for (let i = 0; i < 2; i++) { const t = randomAliveEnemy(actor, all); if (t) applyDmg(actor, t, skill.power, all, false, push) }
      break
    }
    case 103: case 106: case 107: case 203: case 303: case 304: case 305: case 405: case 406: case 407: case 408:
      push(`${actor.name}は静かに構えている`); break

    case 104: { // 鉄壁：シールド付与
      if (actor.shield === 0) { actor.shield = Math.floor(actor.maxHp * 0.30); push(`${actor.name}はシールド(${actor.shield})を展開！`) }
      else push(`${actor.name}のシールドはすでに展開中`)
      break
    }
    case 105: { // 咆哮：敵単体SPD-10
      const t = randomAliveEnemy(actor, all)
      if (t) { addStatus(t, { type: 'spd_down', value: 10, turnsLeft: 2 }); push(`${t.name}のSPDが10下がった！`) }
      break
    }
    case 108: case 201: case 301: { // 大斬撃 / フレイム / 正拳突き：単体攻撃
      const t = randomAliveEnemy(actor, all); if (t) applyDmg(actor, t, skill.power, all, false, push)
      break
    }
    case 202: { // メテオ：全体攻撃
      enemies.forEach(t => applyDmg(actor, t, skill.power, all, false, push, true))
      break
    }
    case 204: { // サンダー：単体＋25%麻痺
      const t = randomAliveEnemy(actor, all)
      if (t) { applyDmg(actor, t, skill.power, all, false, push); if (t.isAlive && Math.random() < 0.25) { addStatus(t, { type: 'paralysis' }); push(`${t.name}は麻痺した！`) } }
      break
    }
    case 205: { // マジックレイン：2-4回
      const n = rand(2, 4); for (let i = 0; i < n; i++) { const t = randomAliveEnemy(actor, all); if (t) applyDmg(actor, t, skill.power, all, false, push) }
      break
    }
    case 206: { // マジックヒール
      const t = lowestHpAlly(actor, all)
      if (t) {
        const h = calcHeal(skill.power, actor.atk)
        t.currentHp = Math.min(t.maxHp, t.currentHp + h)
        if (t.statusEffects.length > 0) { const r = t.statusEffects.shift()!; push(`${t.name}の${r.type === 'poison' ? '毒' : '状態異常'}が治った！`) }
        push(`${t.name}のHPが${h}回復！`)
      }
      break
    }
    case 207: { // 毒霧：全体＋50%毒
      enemies.forEach(t => { applyDmg(actor, t, skill.power, all, false, push, true); if (t.isAlive && Math.random() < 0.5) { addStatus(t, { type: 'poison' }); push(`${t.name}は毒になった！`) } })
      break
    }
    case 208: { // 封印
      const t = randomAliveEnemy(actor, all)
      if (t) { t.sealedPassives = true; push(`${t.name}のパッシブが封印された！`) }
      break
    }
    case 306: { // 気迫：敵全体SPD-10
      enemies.forEach(t => addStatus(t, { type: 'spd_down', value: 10, turnsLeft: 2 }))
      push(`敵全体のSPDが10下がった！`)
      break
    }
    case 307: { // 急所突き：必クリ
      const t = randomAliveEnemy(actor, all); if (t) applyDmg(actor, t, skill.power, all, true, push)
      break
    }
    case 308: { // 突進：50%麻痺
      const t = randomAliveEnemy(actor, all)
      if (t) { applyDmg(actor, t, skill.power, all, false, push); if (t.isAlive && Math.random() < 0.5) { addStatus(t, { type: 'paralysis' }); push(`${t.name}は麻痺した！`) } }
      break
    }
    case 401: { // 剛弓：最大HP15%追加
      const t = randomAliveEnemy(actor, all)
      if (t) { applyDmg(actor, t, skill.power, all, false, push); if (t.isAlive) { const b = Math.floor(t.maxHp * 0.15); t.currentHp -= b; push(`さらに${b}の追加ダメージ！`); if (t.currentHp <= 0) { t.currentHp = 0; t.isAlive = false; push(`${t.name}は倒れた！`) } } }
      break
    }
    case 402: { // 矢雨：3-5回
      const n = rand(3, 5); for (let i = 0; i < n; i++) { const t = randomAliveEnemy(actor, all); if (t) applyDmg(actor, t, skill.power, all, false, push) }
      break
    }
    case 403: { // 狙い撃ち：最低HP敵
      const t = lowestHpEnemy(actor, all); if (t) applyDmg(actor, t, skill.power, all, false, push)
      break
    }
    case 404: { // 毒矢：毒状態なら威力+20
      const t = randomAliveEnemy(actor, all)
      if (t) { const bonus = hasStatus(t, 'poison') ? 20 : 0; applyDmg(actor, t, skill.power + bonus, all, false, push); if (t.isAlive && Math.random() < 0.5) { addStatus(t, { type: 'poison' }); push(`${t.name}は毒になった！`) } }
      break
    }
    default: {
      const t = randomAliveEnemy(actor, all); if (t) applyDmg(actor, t, Math.max(skill.power, 50), all, false, push)
    }
  }
}

// ===== キャラクター初期化 =====

export function initBattleChar(
  id: string, name: string, jobId: number, team: 'player' | 'cpu',
  stats: { hp: number; atk: number; def: number; spd: number },
  skills: Skill[]
): BattleCharacter {
  return { id, name, jobId, team, currentHp: stats.hp, maxHp: stats.hp, atk: stats.atk, def: stats.def, spd: stats.spd, shield: 0, skills, statusEffects: [], isAlive: true, hasUsedKiai: false, sealedPassives: false }
}

// CPU チーム生成
export function generateCpuTeam(avgLevel: number, jobs: Job[], allSkills: Skill[]): BattleCharacter[] {
  const shuffledJobs = [...jobs].sort(() => Math.random() - 0.5).slice(0, 4)
  return shuffledJobs.map((job, i) => {
    const level = Math.max(1, avgLevel + rand(-1, 1))
    const stats = calcStats(job, level)
    const skills = [...allSkills.filter(s => s.job_id === job.id)].sort(() => Math.random() - 0.5).slice(0, 4)
    return initBattleChar(`cpu_${i}`, `${job.name}${i + 1}`, job.id, 'cpu', stats, skills)
  })
}

// ===== メインバトルループ =====

export function runBattle(playerTeam: BattleCharacter[], cpuTeam: BattleCharacter[]): BattleResult {
  const all = [...playerTeam, ...cpuTeam]
  const allLogs: BattleLogEntry[] = []

  // キャラクター状態をスナップショットとして記録する関数
  const makeSnap = (): CharSnapshot[] => all.map(c => ({
    id: c.id, currentHp: c.currentHp, maxHp: c.maxHp,
    shield: c.shield, isAlive: c.isAlive, statusEffects: [...c.statusEffects],
  }))

  let currentTurn = 1
  const push: PushLog = (msg, type = 'action') => {
    allLogs.push({ turn: currentTurn, message: msg, type, snapshot: makeSnap() })
  }

  for (let turn = 1; turn <= 30; turn++) {
    currentTurn = turn
    push(`=== ターン ${turn} ===`)

    const sorted = [...all].filter(c => c.isAlive).sort((a, b) => getEffectiveSpd(b) - getEffectiveSpd(a))

    for (const actor of sorted) {
      if (!actor.isAlive) continue

      // スタン
      const stun = actor.statusEffects.find(e => e.type === 'stun')
      if (stun) { push(`${actor.name}はスタンで動けない！`); actor.statusEffects = actor.statusEffects.filter(e => e.type !== 'stun'); continue }

      // 麻痺：50%で行動不能
      if (hasStatus(actor, 'paralysis') && Math.random() < 0.5) { push(`${actor.name}は麻痺で動けない！`); continue }

      // パッシブ以外のスキルをすべて発動
      const activeSkills = actor.skills.filter(s => s.type !== 'パッシブ')
      if (activeSkills.length === 0) { push(`${actor.name}は行動できない`); continue }

      for (const skill of activeSkills) {
        if (!actor.isAlive) break
        execSkill(actor, skill, all, push)
        if (!all.some(c => c.team === 'player' && c.isAlive) || !all.some(c => c.team === 'cpu' && c.isAlive)) break
      }

      if (!all.some(c => c.team === 'player' && c.isAlive) || !all.some(c => c.team === 'cpu' && c.isAlive)) break
    }

    // ターン終了：毒ダメージ・デバフ減少
    for (const char of all.filter(c => c.isAlive)) {
      if (hasStatus(char, 'poison')) {
        const d = Math.floor(char.maxHp * 0.05)
        char.currentHp -= d
        push(`${char.name}は毒で${d}ダメージ！`)
        if (char.currentHp <= 0) {
          if (!char.hasUsedKiai && !char.sealedPassives && char.skills.some(s => s.id === 107)) { char.currentHp = 1; char.hasUsedKiai = true; push(`${char.name}は気合いで耐えた！`) }
          else { char.currentHp = 0; char.isAlive = false; push(`${char.name}は倒れた！`) }
        }
      }
      char.statusEffects = char.statusEffects.filter(e => {
        if (e.type === 'spd_down' && e.turnsLeft !== undefined) { e.turnsLeft--; return e.turnsLeft > 0 }
        return true
      })
      if (char.sealedPassives) { char.sealedPassives = false; push(`${char.name}の封印が解除された`) }
    }

    const pAlive = all.some(c => c.team === 'player' && c.isAlive)
    const cAlive = all.some(c => c.team === 'cpu' && c.isAlive)
    if (!pAlive || !cAlive) {
      const winner = !pAlive && !cAlive ? 'draw' : pAlive ? 'player' : 'cpu'
      const msg = winner === 'draw' ? '両チーム全滅！引き分け！' : winner === 'player' ? '勝利！' : '敗北...'
      push(msg, 'result')
      return { winner, turns: turn, logs: allLogs, finalPlayerTeam: playerTeam, finalCpuTeam: cpuTeam }
    }
  }

  push('30ターン経過！引き分け！', 'result')
  return { winner: 'draw', turns: 30, logs: allLogs, finalPlayerTeam: playerTeam, finalCpuTeam: cpuTeam }
}
