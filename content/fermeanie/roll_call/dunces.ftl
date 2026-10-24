### Tone: The roll call, for a returning player with dunce caps on record from earlier games. One of several pools the
### roll call may draw from: never the only thing she says to them. $dunces: their dunce caps in all earlier games (≥ 1).
### Patronising about the hats, never cruel about the person. A cap is a lab accident filed away, never a trophy or a
### collection: don't make the player sound proud of it.

roll-call-dunces-1 =
    { $name }. { $dunces ->
        [one] One dunce cap on record.
       *[other] { $dunces } dunce caps on record.
    } I keep them in a small museum. Admission is free.
roll-call-dunces-2 =
    { $name }. The dunce cap remembers you. { $dunces ->
        [one] It asked about you.
       *[other] It asked about you { $dunces } times.
    }
roll-call-dunces-3 =
    { $name }. { $dunces ->
        [one] You have worn the dunce cap once before.
       *[other] You have worn the dunce cap { $dunces } times before.
    } I’ve had it pressed and folded. Just in case.
roll-call-dunces-4 = { $name }. Welcome back. Your dunce cap is still in the cloakroom. Shall I fetch it now, or later?
roll-call-dunces-5 =
    { $name }. { $dunces ->
        [one] One incident report on file.
       *[other] { $dunces } incident reports on file.
    } All of them involve a paper hat. Let’s keep today’s paperwork light.
roll-call-dunces-6 = { $name }. I’ve read your file. The part about the paper hat was my favourite. I read it twice.
roll-call-dunces-7 =
    { $name }. { $dunces ->
        [one] One dunce cap so far.
       *[other] { $dunces } dunce caps so far.
    } Please try to keep your estimates on this planet today.
roll-call-dunces-8 = { $name }. I recognise you. Usually from below a pointed paper hat. Welcome back.
roll-call-dunces-9 =
    { $name }. Your dunce cap count is { $dunces }. { $dunces ->
        [one] I had hoped it would stay a one-off.
       *[other] I had hoped it would stop going up.
    } Hope is not very scientific.
roll-call-dunces-10 = { $name }. The lab has asked me to keep a dunce cap on standby for you. Purely a precaution. Mostly.
