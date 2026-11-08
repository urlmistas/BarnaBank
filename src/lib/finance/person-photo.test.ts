import { describe, expect, it } from 'vitest'
import { MAX_PHOTO_CHARS, photoOf, withPhoto } from './person-photo'

const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

describe('foto de perfil do contato', () => {
  it('lê só imagem de verdade e dentro do limite', () => {
    expect(photoOf({ phone: '', photo: JPG })).toBe(JPG)
    expect(photoOf(undefined)).toBe('')
    expect(photoOf({ phone: '' })).toBe('')
    expect(photoOf({ phone: '', photo: 'javascript:alert(1)' })).toBe('')
    expect(photoOf({ phone: '', photo: 'data:text/html;base64,PHNjcmlwdD4=' })).toBe('')
    expect(photoOf({ phone: '', photo: 'data:image/jpeg;base64,' + 'A'.repeat(MAX_PHOTO_CHARS) })).toBe('')
  })
  it('troca a foto sem mexer no resto do contato', () => {
    const c = { phone: '1199', tags: ['amigo'], notes: 'x' }
    const com = withPhoto(c, JPG)
    expect(com).toEqual({ ...c, photo: JPG })
    expect(c).not.toHaveProperty('photo')
    const sem = withPhoto(com, '')
    expect(sem).toEqual(c)
    expect(withPhoto(com, 'lixo')).toEqual(c)
    expect(withPhoto(undefined, JPG)).toEqual({ phone: '', photo: JPG })
  })
})
