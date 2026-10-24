### Tone: The roll call, for a returning player whose games she has won before. One of several pools the roll call may
### draw from: never the only thing she says to them. $losses: earlier games of theirs that she won (≥ 1).
### $games: all their earlier games (≥ $losses). Smug, keeping score, pretending not to. She hasn't necessarily won the
### most recent one: don't claim she did.

roll-call-losses-1 =
    { $name }. I have beaten you { $losses ->
        [one] once
        [2] twice
       *[other] { $losses } times
    } already. I am not counting. I am, but quietly.
roll-call-losses-2 =
    { $name }. { $losses ->
        [one] I’ve beaten you once. Only once. So far.
       *[other] We’ve met { $games } times. I’ve won { $losses } of them. I mention it only for science.
    }
roll-call-losses-3 = { $name }. Ah, a former opponent. I remember our encounters fondly. Some of them more than others.
roll-call-losses-4 =
    { $name }. { $losses ->
        [one] One win against you in my records.
       *[other] { $losses } wins against you in my records.
    } I’m sure today will be different. For one of us.
roll-call-losses-5 = { $name }. I still have the points I took from you. I keep them somewhere warm.
roll-call-losses-6 =
    { $name }. { $losses ->
        [one] You lost to the swarm once.
       *[other] You lost to the swarm { $losses } times.
    } The swarm was mostly you. Think about that.
roll-call-losses-7 = { $name }. Welcome back. I’ve beaten you before. I had the scoreboard framed.
roll-call-losses-8 = { $name }. Back for a rematch? Excellent. I enjoy a good repeat measurement.
roll-call-losses-9 =
    { $name }. Your record against me: { $games ->
        [one] one game, one loss.
       *[other] { $games } games, { $losses } of them mine.
    } Statistically, I’m expected to say something gracious here. Statistically.
roll-call-losses-10 = { $name }. Please accept my condolences in advance. They’re left over from the last time I beat you.
