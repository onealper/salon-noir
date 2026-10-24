// Roulette's other players own their chips. The controller debits a chip as it leaves the rail,
// locks the wagers when betting closes, and settles them once. This bank never reads your wallet.
import { CHIP_VALUES, breakDown } from '../core/chips.mjs';
import { LIMITS, SPOTS } from './rules.mjs';

export const COLOUR_RESERVE_LIMIT = 200;

export const ROULETTE_PLAYERS = Object.freeze([
  { id: 'olu', name: 'Olu', color: '#7fb3d9', inserts: 4, unit: 5, style: 'straights' },
  { id: 'marta', name: 'Marta', color: '#c25b86', inserts: 8, unit: 10, style: 'outside' },
  { id: 'kenji', name: 'Kenji', color: '#1f8f8c', inserts: 12, unit: 25, style: 'sections' },
  { id: 'ines', name: 'Inès', color: '#8b5a2b', inserts: 16, unit: 10, style: 'dozens' },
].map(Object.freeze));

const money = (value, label) => {
  if (typeof value !== 'number' || value < 0 || !Number.isSafeInteger(value * 2)) throw new RangeError(`${label} must be a nonnegative half-chip amount.`);
  return value;
};
const number = n => {
  if (!Number.isInteger(n) || n < 0 || n > 36) throw new RangeError('The winning number must be from 0 to 36.');
};

export class RoulettePlayer {
  #bankroll;
  #bets = [];
  #staked = 0;
  #phase = 'betting';
  #result = null;
  constructor(profile, { bankroll = profile?.bankroll ?? 1000 } = {}) {
    if (!profile || typeof profile.id !== 'string' || !profile.id || typeof profile.name !== 'string' || !profile.name) throw new TypeError('A roulette player needs a stable id and name.');
    money(profile.unit, 'unit');
    if (!Number.isInteger(profile.unit) || profile.unit < LIMITS.min) throw new RangeError(`The colour chip unit must be a whole-chip value of at least ${LIMITS.min}.`);
    money(bankroll, 'bankroll');
    if (bankroll < profile.unit) throw new RangeError('The starting bankroll must cover a colour chip.');
    this.profile = Object.freeze({ ...profile });
    this.initialBankroll = bankroll; this.#bankroll = bankroll;
    this.buyIns = 0; this.rebuys = 0; this.rounds = 0;
  }
  get id() { return this.profile.id; }
  get name() { return this.profile.name; }
  get color() { return this.profile.color; }
  get inserts() { return this.profile.inserts; }
  get unit() { return this.profile.unit; }
  get style() { return this.profile.style; }
  get bankroll() { return this.#bankroll; }
  get staked() { return this.#staked; }
  get busy() { return this.#phase === 'closed'; }
  get phase() { return this.#phase; }
  get result() { return this.#result; }
  // A snapshot cannot silently add wagers or erase the chips already debited from this bank.
  get bets() { return Object.freeze(this.#bets.map(bet => Object.freeze([...bet]))); }
  get inventory() {
    // Keep a workable float of colour chips; the dealer exchanges larger reserves into value chips.
    // No value disappears: a cash chip of the assigned colour unit joins that colour's count too.
    let colour = Math.min(COLOUR_RESERVE_LIMIT, Math.floor(this.#bankroll / this.unit));
    const change = [];
    for (const value of breakDown(this.#bankroll - colour * this.unit)) {
      if (value === this.unit) colour++; else change.push(value);
    }
    return { colour, change, count: colour + change.length, amount: this.#bankroll, unit: this.unit };
  }
  get reserveCount() { return this.inventory.count; }
  get reserveValues() { const { colour, change } = this.inventory; return [...Array(colour).fill(this.unit), ...change]; }
  on(id) { return this.#bets.reduce((total, [spot, value]) => total + (spot === id ? value : 0), 0); }

  canPlace(id, value = this.unit) {
    const spot = SPOTS.get(id);
    if (this.#phase !== 'betting' || !spot || typeof value !== 'number' || !Number.isSafeInteger(value * 2) || value < LIMITS.min || value > this.#bankroll) return false;
    // A chip must exist in the reserve: own-colour units or the standard value chips making its change.
    if (value !== this.unit && (!CHIP_VALUES.includes(value) || !this.inventory.change.includes(value))) return false;
    return this.#staked + value <= LIMITS.table && this.on(id) + value <= spot.max;
  }
  place(id, value = this.unit) {
    if (!this.canPlace(id, value)) return false;
    this.#bankroll -= value; this.#staked += value; this.#bets.push([id, value]);
    return true;
  }
  close() {
    if (this.#phase !== 'betting' || !this.#bets.length) return false;
    this.#phase = 'closed'; return true;
  }
  settle(n) {
    number(n);
    if (this.#phase === 'settled') return this.#result;
    if (this.#phase !== 'closed') return null;
    const stakes = new Map();
    for (const [id, value] of this.#bets) stakes.set(id, (stakes.get(id) ?? 0) + value);
    const wins = [], losses = []; let back = 0, partage = 0;
    for (const [id, stake] of stakes) {
      const spot = SPOTS.get(id);
      if (spot.nums.includes(n)) {
        const pay = stake * spot.pays; back += stake + pay;
        wins.push(Object.freeze({ id, stake, pay, kind: spot.kind }));
      } else {
        const half = n === 0 && spot.kind === 'even' ? stake / 2 : 0;
        back += half; partage += half;
        losses.push(Object.freeze({ id, stake, back: half, kind: spot.kind }));
      }
    }
    const bankroll = money(this.#bankroll + back, 'settled bankroll');
    this.#result = Object.freeze({ n, staked: this.#staked, back, partage, net: back - this.#staked, wins: Object.freeze(wins), losses: Object.freeze(losses) });
    this.#bankroll = bankroll; this.#phase = 'settled'; this.rounds++;
    return this.#result;
  }
  // Before betting closes, departure/cancellation returns exactly what this player put on the felt.
  // A closed wager belongs to its spin, so a leave or repeated cleanup cannot undo it or pay it twice.
  cancel() {
    if (this.#phase !== 'betting') return 0;
    const back = this.#staked; this.#bankroll += back; this.#bets = []; this.#staked = 0;
    return back;
  }
  // Call at a round boundary, after payout/cleanup. A player too short for their colour chip buys
  // back to their original bank; tracking the added money keeps wins/losses distinct from a rebuy.
  beginRound() {
    if (this.#phase === 'closed' || this.#phase === 'betting' && this.#staked) return 0;
    this.#bets = []; this.#staked = 0; this.#result = null; this.#phase = 'betting';
    if (this.#bankroll >= this.unit) return 0;
    const added = this.initialBankroll - this.#bankroll;
    this.#bankroll += added; this.buyIns += added; this.rebuys++;
    return added;
  }
}
