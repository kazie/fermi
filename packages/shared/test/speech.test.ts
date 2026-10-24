import { describe, expect, it } from 'vitest'
import { formatFactor, formatNumber, GROUP } from '../src/calc/format.ts'
import { sentences, speechText } from '../src/speech.ts'

describe('speechText', () => {
  it.each([
    ['**Fixed** a bug where *Alex* was ~~briefly~~ competitive.', 'Fixed a bug where Alex was briefly competitive.'],
    ['The answer was ||classified||.', 'The answer was redacted.'],
    ['A name like \\*\\*Bob\\*\\* stays literal.', 'A name like **Bob** stays literal.'],
    [`Alex was ${formatFactor(2.4)} off.`, 'Alex was 2 point 4 times off.'],
    [`Alex was ${formatFactor(3210)} off.`, 'Alex was 3200 times off.'],
    [`Alex was ${formatFactor(4.1e6)} off.`, 'Alex was 4 point 1 million times off.'],
    [`Alex was ${formatFactor(3.2e20)} off.`, 'Alex was 3 point 2 times 10 to the 20 times off.'],
    [`Alex was ${formatFactor(Infinity)} off.`, 'Alex was infinitely off.'],
    [`You said ${formatNumber(-0.00001)}.`, 'You said -10 to the minus 5.'],
    [`You said ${formatNumber(31622400)}.`, 'You said 31622400.'],
    ['FerMEANie v3.14 is out.', 'FerMEANie version 3 point 1 4 is out.'],
    ['How many 1,000,000 km² of CO₂ per 2.5 m³?', 'How many 1000000 km squared of CO2 per 2 point 5 m cubed?'],
    ['Between 3, 400 and 1999 people', 'Between 3, 400 and 1999 people'],
  ])('%s', (line, spoken) => expect(speechText(line)).toBe(spoken))

  it('joins digit groups only with the narrow space the game uses', () => {
    expect(speechText(`3${GROUP}200`)).toBe('3200')
  })
})

describe('sentences', () => {
  it.each([
    ['One. Two! Three? Four… Five', ['One.', 'Two!', 'Three?', 'Four…', 'Five']],
    ['She said "go." Then left.', ['She said "go."', 'Then left.']],
    ['Dr. Who met J. R. Smith. Then e.g. tea.', ['Dr. Who met J. R. Smith.', 'Then e.g. tea.']],
    ['Was it 2 point 4 times? Yes.', ['Was it 2 point 4 times?', 'Yes.']],
    ['Hmm... okay then. Fine.', ['Hmm... okay then.', 'Fine.']],
    ['', []],
    ['… ', []],
  ])('%s', (text, expected) => expect(sentences(text)).toEqual(expected))
})
