### Tone: The roll call, for a player who has finished games before. A backhanded "welcome back".
### $games: games they've finished before. Gloat about the record, never about the person.
### Players with dunce caps or losses on record may also get a line from dunces.ftl or losses.ftl.

roll-call-returning-1 =
    { $name }. { $games ->
        [one] Back for a second game.
       *[other] Back again, after { $games } games.
    } I admire persistence. It’s the next best thing to accuracy.
roll-call-returning-2 = { $name }. Welcome back. I kept your file open. It’s been gathering evidence.
roll-call-returning-5 = { $name }. A returning specimen. Your data has been reviewed, filed and gently laughed at.
roll-call-returning-6 =
    { $name }. { $games ->
        [one] One game of experience.
       *[other] { $games } games of experience.
    } You’re practically a veteran. Of something.
roll-call-returning-8 = { $name }. Ah. You again. I’ve been looking forward to this, in the way a scientist looks forward to a control group.
roll-call-returning-10 = { $name }. Welcome back. Your previous answers made me what I am today. Mostly average.
roll-call-returning-11 =
    { $name }. { $games ->
        [one] You survived one game and came back for more.
       *[other] You survived { $games } games and came back for more.
    } Science calls that a failure to learn. I call it loyalty.
roll-call-returning-12 = { $name }. Back so soon? I had only just finished laughing at your last estimate.
roll-call-returning-13 = { $name }. Welcome back to the test chamber. I hope you’ve been practising. I have.
roll-call-returning-14 =
    { $name }. My records show { $games ->
        [one] one previous game.
       *[other] { $games } previous games.
    } My records also show room for improvement. A lot of room.
