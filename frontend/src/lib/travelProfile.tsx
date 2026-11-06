import { Gem, Heart, Landmark, Mountain, Music2, PartyPopper, Scale, Sparkles, Tent, Trees, User, Users, UtensilsCrossed, Wallet, Waves } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Interest, TravelParty, TravelStyle } from './account'

/** The three questions asked after sign-up (also editable in Settings → Preferences). */

export const INTERESTS: { id: Interest; label: string; hint: string; icon: ReactNode; tint: string }[] = [
  { id: 'beaches', label: 'Beaches', hint: 'Sun, sand and sea', icon: <Waves size={22} />, tint: 'from-sky-400 to-cyan-500' },
  { id: 'mountains', label: 'Mountains', hint: 'Hill stations and snow', icon: <Mountain size={22} />, tint: 'from-slate-500 to-indigo-600' },
  { id: 'heritage', label: 'Heritage', hint: 'Forts, palaces, museums', icon: <Landmark size={22} />, tint: 'from-amber-500 to-orange-600' },
  { id: 'food', label: 'Food', hint: 'Street food to fine dining', icon: <UtensilsCrossed size={22} />, tint: 'from-rose-400 to-red-500' },
  { id: 'adventure', label: 'Adventure', hint: 'Treks, rafting, safaris', icon: <Tent size={22} />, tint: 'from-lime-500 to-green-600' },
  { id: 'nature', label: 'Nature', hint: 'Lakes, forests, wildlife', icon: <Trees size={22} />, tint: 'from-emerald-400 to-teal-600' },
  { id: 'spiritual', label: 'Spiritual', hint: 'Temples, yoga, retreats', icon: <Sparkles size={22} />, tint: 'from-violet-400 to-purple-600' },
  { id: 'nightlife', label: 'Nightlife', hint: 'Shopping, cafés, parties', icon: <Music2 size={22} />, tint: 'from-fuchsia-500 to-pink-600' },
]

export const PARTIES: { id: Exclude<TravelParty, ''>; label: string; hint: string; icon: ReactNode }[] = [
  { id: 'solo', label: 'Solo', hint: 'Just me, my own pace', icon: <User size={24} /> },
  { id: 'couple', label: 'As a couple', hint: 'With my partner', icon: <Heart size={24} /> },
  { id: 'family', label: 'With family', hint: 'Kids or parents along', icon: <Users size={24} /> },
  { id: 'friends', label: 'With friends', hint: 'A group trip', icon: <PartyPopper size={24} /> },
]

export const STYLES: { id: Exclude<TravelStyle, ''>; label: string; hint: string; points: string[]; icon: ReactNode }[] = [
  { id: 'budget', label: 'Budget', hint: 'Make every rupee count', points: ['Trains and buses', 'Hostels and guesthouses', 'Local eateries'], icon: <Wallet size={24} /> },
  { id: 'balanced', label: 'Balanced', hint: 'Comfort without overspending', points: ['Best value travel', '3-star comfort', 'A mix of restaurants'], icon: <Scale size={24} /> },
  { id: 'premium', label: 'Premium', hint: 'Treat yourself', points: ['Flights first', '4–5 star hotels', 'Fine dining'], icon: <Gem size={24} /> },
]

/** A first-trip idea that matches what the traveler picked, for the "Plan my first trip" button. */
export function firstTripIdea(interests: Interest[], party: TravelParty, style: TravelStyle, homeCity: string): string {
  const where: Record<Interest, string> = {
    beaches: 'Goa',
    mountains: 'Manali',
    heritage: 'Jaipur and Udaipur',
    food: 'Amritsar',
    adventure: 'Rishikesh',
    nature: 'Kerala',
    spiritual: 'Varanasi',
    nightlife: 'Dubai',
  }
  const who = { solo: 'solo', couple: 'for 2', family: 'for a family of 4', friends: 'for 4 friends', '': 'for 2' }[party]
  const place = where[interests[0] ?? 'beaches']
  const from = homeCity ? ` from ${homeCity}` : ''
  const level = style ? `, ${style}` : ''
  return `${place}${from}, 5 days ${who}${level}`
}
