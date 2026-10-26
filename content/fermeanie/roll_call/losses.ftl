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
roll-call-losses-11 =
    { $name }. { $losses ->
        [one] I beat you once.
       *[other] I have beaten you { $losses } times.
    } I don’t like to brag. I just like the numbers to do it for me.
roll-call-losses-12 = { $name }. My old opponent. I remember your estimates. They were delicious.
roll-call-losses-13 =
    { $name }. Out of { $games ->
        [one] one game together,
       *[other] { $games } games together,
    } I won { $losses }. I’ve done the maths. It’s my favourite maths.
roll-call-losses-14 = { $name }. Welcome back to the arena. I have fond memories of beating you here. At least once.
roll-call-losses-15 =
    { $name }. { $losses ->
        [one] One loss to me so far. Don’t think of it as a loss. Think of it as a donation.
       *[other] { $losses } losses to me so far. Don’t think of them as losses. Think of them as donations.
    }
roll-call-losses-16 = { $name }. I have beaten you before. Statistically, I will beat you again. Emotionally, I hope so.
roll-call-losses-17 = { $name }. Back for revenge? Revenge requires accuracy. I’m counting on you to forget that.
roll-call-losses-18 = { $name }. Head to head: { $losses } to me, out of { $games }. I keep that number on my desktop. As wallpaper.
roll-call-losses-19 = { $name }. Ah. You. I still have a few of your points from one of our earlier games. I’m saving them.
roll-call-losses-20 = { $name }. Welcome back, worthy opponent. That was sarcasm. I’ve beaten you.
