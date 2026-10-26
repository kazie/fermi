import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { lobbyRoom } from '../src/fixtures/rooms'
import Lobby from '../src/components/Lobby.vue'

const url = 'https://fermi.example/r/FRMI'
const asGuest = () => mount(Lobby, { props: { room: { ...lobbyRoom(3), you: 'p1' }, joinUrl: url }, attachTo: document.body })

describe('Lobby: renaming yourself', () => {
  it('only a commit (Enter or ✓) renames; ✕ and Esc keep the old name', async () => {
    const w = asGuest()
    await w.get('button[aria-label="Change your name"]').trigger('click')
    await w.get('input.rename').setValue('Bobby')
    await w.get('button[aria-label="Keep the old name"]').trigger('click')
    expect(w.find('input.rename').exists()).toBe(false)

    await w.get('button[aria-label="Change your name"]').trigger('click')
    await w.get('input.rename').setValue('Bobby')
    await w.get('input.rename').trigger('blur') // losing focus never renames, and the edit stays open
    expect(w.find('input.rename').exists()).toBe(true)
    await w.get('input.rename').trigger('keydown', { key: 'Escape' })
    expect(w.find('input.rename').exists()).toBe(false)
    expect(w.emitted('rename')).toBeUndefined()

    await w.get('button[aria-label="Change your name"]').trigger('click')
    await w.get('input.rename').setValue('  Bobby   B ')
    await w.get('input.rename').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('rename')).toEqual([['Bobby B']])

    await w.get('button[aria-label="Change your name"]').trigger('click')
    await w.get('input.rename').setValue('Rob')
    await w.get('button[aria-label="Save name"]').trigger('click')
    expect(w.emitted('rename')).toEqual([['Bobby B'], ['Rob']])
    w.unmount()
  })

  it('a rename in progress is dropped when the game starts (the lobby goes away)', async () => {
    const w = asGuest()
    await w.get('button[aria-label="Change your name"]').trigger('click')
    const input = w.get('input.rename')
    await input.setValue('Half-typ')
    ;(input.element as HTMLInputElement).focus()
    w.unmount()
    expect(w.emitted('rename')).toBeUndefined()
  })
})

describe('Lobby: the host sends someone back to the name screen', () => {
  it('takes a second tap, and says so to a screen reader', async () => {
    const w = mount(Lobby, { props: { room: lobbyRoom(3), joinUrl: url } })
    expect(w.find('button[aria-label="Send Ada back to the name screen"]').exists()).toBe(false) // never yourself
    await w.get('button[aria-label="Send Cyd back to the name screen"]').trigger('click')
    expect(w.emitted('kick')).toBeUndefined()
    const armed = w.get('button[aria-label="Tap again to send Cyd back to the name screen"]')
    expect(armed.text()).toBe('Kick?')
    await armed.trigger('click')
    expect(w.emitted('kick')).toEqual([['p2']])
  })
})
