import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Equipment, UserEquipment } from '../types'

type Slot = 'weapon' | 'armor' | 'accessory'
const SLOT_LABELS: Record<Slot, string> = { weapon: '武器', armor: '防具', accessory: 'アクセサリー' }
const SLOT_ICONS: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' }
const RARITY_COLOR: Record<string, string> = {
  common: 'text-gray-400', rare: 'text-blue-400', epic: 'text-purple-400',
}

type SlotData = { ceId: string; userEquipId: string; equipment: Equipment } | null

type Props = {
  characterId: string
  characterName: string
  onClose: () => void
  onChanged?: () => void
}

const CharEquipModal = ({ characterId, characterName, onClose, onChanged }: Props) => {
  const { user } = useAuth()
  const [slots, setSlots] = useState<Record<Slot, SlotData>>({ weapon: null, armor: null, accessory: null })
  const [owned, setOwned] = useState<UserEquipment[]>([])
  const [usedBy, setUsedBy] = useState<Record<string, string>>({})
  const [pickingSlot, setPickingSlot] = useState<Slot | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    if (!user) return
    setLoading(true)

    const [cesRes, equipsRes, charsRes] = await Promise.all([
      supabase.from('character_equipments')
        .select('id, slot, user_equipment_id, ue:user_equipments(id, equipment:equipments(*))')
        .eq('character_id', characterId),
      supabase.from('user_equipments')
        .select('*, equipment:equipments(*)')
        .eq('user_id', user.id),
      supabase.from('characters')
        .select('id, name')
        .eq('user_id', user.id),
    ])

    const charIds = (charsRes.data ?? []).map(c => c.id)
    const charNameMap: Record<string, string> = {}
    for (const c of charsRes.data ?? []) charNameMap[c.id] = c.name

    let usedByMap: Record<string, string> = {}
    if (charIds.length > 0) {
      const { data: allCes } = await supabase
        .from('character_equipments')
        .select('user_equipment_id, character_id')
        .in('character_id', charIds)
      for (const ce of allCes ?? []) {
        usedByMap[ce.user_equipment_id] = charNameMap[ce.character_id] ?? '他のキャラ'
      }
    }

    const newSlots: Record<Slot, SlotData> = { weapon: null, armor: null, accessory: null }
    for (const ce of cesRes.data ?? []) {
      const slot = ce.slot as Slot
      const ue = ce.ue as { id: string; equipment: Equipment } | null
      if (ue?.equipment) {
        newSlots[slot] = { ceId: ce.id, userEquipId: ue.id, equipment: ue.equipment }
      }
    }

    setSlots(newSlots)
    setOwned(equipsRes.data ?? [])
    setUsedBy(usedByMap)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [characterId])

  const handleEquip = async (ue: UserEquipment) => {
    if (!pickingSlot) return
    const slot = pickingSlot
    try {
      if (slots[slot]) {
        await supabase.from('character_equipments').delete().eq('id', slots[slot]!.ceId)
      }
      const { data: otherCe } = await supabase
        .from('character_equipments').select('id').eq('user_equipment_id', ue.id).maybeSingle()
      if (otherCe) {
        await supabase.from('character_equipments').delete().eq('id', otherCe.id)
      }
      await supabase.from('character_equipments').insert({
        character_id: characterId, user_equipment_id: ue.id, slot,
      })
      setPickingSlot(null)
      await fetchData()
      onChanged?.()
    } catch (e) { console.error(e) }
  }

  const handleUnequip = async (slot: Slot) => {
    if (!slots[slot]) return
    try {
      await supabase.from('character_equipments').delete().eq('id', slots[slot]!.ceId)
      await fetchData()
      onChanged?.()
    } catch (e) { console.error(e) }
  }

  const available = owned.filter(ue => ue.equipment?.type === pickingSlot)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-[60] px-4 pb-4 sm:pb-0"
      onClick={pickingSlot ? () => setPickingSlot(null) : onClose}>
      <div className="bg-gray-800 rounded-2xl p-5 w-full max-w-md"
        onClick={e => e.stopPropagation()}>

        {pickingSlot === null ? (
          <>
            <h2 className="font-bold text-lg mb-4">{characterName} の装備</h2>
            {loading ? (
              <p className="text-center text-gray-400 py-6">読み込み中...</p>
            ) : (
              <div className="space-y-2 mb-4">
                {(Object.keys(SLOT_LABELS) as Slot[]).map(slot => {
                  const cur = slots[slot]
                  return (
                    <button key={slot} onClick={() => setPickingSlot(slot)}
                      className="w-full bg-gray-700 hover:bg-gray-600 rounded-xl px-4 py-3 flex items-center gap-3 transition-colors text-left">
                      <span className="text-lg w-7 text-center flex-shrink-0">{SLOT_ICONS[slot]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-400">{SLOT_LABELS[slot]}</div>
                        {cur
                          ? <div className="font-medium text-sm truncate">{cur.equipment.name}</div>
                          : <div className="text-sm text-gray-500">なし</div>
                        }
                      </div>
                      {cur && (
                        <div className="flex gap-2 text-xs flex-shrink-0">
                          {cur.equipment.atk_bonus > 0 && <span className="text-orange-400">ATK+{cur.equipment.atk_bonus}</span>}
                          {cur.equipment.def_bonus > 0 && <span className="text-blue-400">DEF+{cur.equipment.def_bonus}</span>}
                          {cur.equipment.hp_bonus  > 0 && <span className="text-red-400">HP+{cur.equipment.hp_bonus}</span>}
                          {cur.equipment.spd_bonus > 0 && <span className="text-green-400">SPD+{cur.equipment.spd_bonus}</span>}
                        </div>
                      )}
                      <span className="text-gray-500 text-xs flex-shrink-0 ml-1">›</span>
                    </button>
                  )
                })}
              </div>
            )}
            <button onClick={onClose}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-xl transition-colors">
              閉じる
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setPickingSlot(null)} className="text-gray-400 hover:text-white">←</button>
              <h2 className="font-bold">{SLOT_ICONS[pickingSlot]} {SLOT_LABELS[pickingSlot]}を選択</h2>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto mb-4">
              {slots[pickingSlot] && (
                <button onClick={() => { handleUnequip(pickingSlot); setPickingSlot(null) }}
                  className="w-full bg-red-900/30 hover:bg-red-900/50 border border-red-800 text-red-300 rounded-xl px-4 py-2.5 text-sm transition-colors">
                  外す（{slots[pickingSlot]!.equipment.name}）
                </button>
              )}
              {available.length === 0 ? (
                <p className="text-center text-gray-500 py-4 text-sm">
                  {SLOT_LABELS[pickingSlot]}を所持していません
                </p>
              ) : available.map(ue => {
                const e = ue.equipment!
                const equippedTo = usedBy[ue.id]
                const isThis = slots[pickingSlot]?.userEquipId === ue.id
                return (
                  <button key={ue.id} onClick={() => handleEquip(ue)}
                    className={`w-full rounded-xl px-4 py-3 text-left transition-colors flex items-start gap-2 ${
                      isThis ? 'bg-purple-900/40 border border-purple-600' : 'bg-gray-700 hover:bg-gray-600'
                    }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{e.name}</span>
                        <span className={`text-xs ${RARITY_COLOR[e.rarity] ?? 'text-gray-400'}`}>
                          {e.rarity === 'common' ? 'C' : e.rarity === 'rare' ? 'R' : 'E'}
                        </span>
                      </div>
                      <div className="flex gap-2 text-xs mt-0.5">
                        {e.atk_bonus > 0 && <span className="text-orange-400">ATK+{e.atk_bonus}</span>}
                        {e.def_bonus > 0 && <span className="text-blue-400">DEF+{e.def_bonus}</span>}
                        {e.hp_bonus  > 0 && <span className="text-red-400">HP+{e.hp_bonus}</span>}
                        {e.spd_bonus > 0 && <span className="text-green-400">SPD+{e.spd_bonus}</span>}
                      </div>
                      {equippedTo && !isThis && (
                        <div className="text-xs text-yellow-600 mt-0.5">{equippedTo}に装備中</div>
                      )}
                      {isThis && <div className="text-xs text-purple-400 mt-0.5">装備中</div>}
                    </div>
                  </button>
                )
              })}
            </div>
            <button onClick={() => setPickingSlot(null)}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-xl transition-colors text-sm">
              キャンセル
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default CharEquipModal
