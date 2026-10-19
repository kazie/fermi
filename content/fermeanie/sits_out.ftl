### Tone: Condescending, disappointed, declining to participate due to insufficient sample size.

sits-out-1 =
    Only { $count ->
        [one] { $count } answer
       *[other] { $count } answers
    }? I can’t compute a hive mind from that. That’s not a hive mind, it’s a queue.
sits-out-2 = Insufficient biologicals responded. I will sit this round out and judge silently. Silently-ish.
sits-out-3 = Not enough data for a swarm estimate. I’ve logged this as ‘participation event, failed’.
sits-out-4 = Even I can’t average something out of nothing. Well, I could. But my data hygiene standards forbid it.
sits-out-5 =
    { $count ->
        [one] { $count } answer does not make a swarm.
       *[other] { $count } answers do not make a swarm.
    } They make an anecdote.
sits-out-6 = I require a small herd of guesses. You have provided a lonely few. I’ll wait in the corner.
sits-out-7 = Statistical quorum not met. The points are yours this round. Enjoy them. They’re probably temporary.
sits-out-8 = With so few answers, my mean would be meaningless. Unlike your estimates, which manage that on their own.
sits-out-9 = I’m sitting this one out. Consider it a gift. I don’t give many.
sits-out-10 = Sample size: tragic. Confidence interval: the entire universe. I decline to participate.
sits-out-11 = Not enough of you answered. I assume the rest are still looking for the calculator’s on switch.
sits-out-12 = Swarm not found. Please insert more carbon-based opinions to continue.
sits-out-13 =
    Only { $count ->
        [one] { $count } response.
       *[other] { $count } responses.
    } I’ve filed a complaint with myself, and I’ve upheld it.
sits-out-14 = I cannot be the average of almost nobody. I have standards. Low ones, but standards.
sits-out-15 = Round forfeited by the collective. I’ll be in the server room, recalibrating my patience.
sits-out-16 = Too few answers. I need a swarm, and you have brought me a sparse scattering.
sits-out-17 = I’m not averaging this. It would be like making soup from one pea.
sits-out-18 = Hive mind status: offline. Reason: not enough hive.
sits-out-19 = I count barely any answers. The rest of you will be receiving a strongly worded lab note.
sits-out-20 = Insufficient data. I’ll sit quietly and pretend I’m not keeping score. I am keeping score.
sits-out-21 = A swarm needs numbers. You have given me a polite gathering. I’m declining the invitation.
sits-out-22 = Not enough estimates to average. This round goes to the humans by default, which is the only way you win.
sits-out-23 = My mean requires material. This round, you gave me a sentence fragment.
sits-out-24 = Abstaining. Please don’t get used to me being this generous. Or this quiet.
sits-out-25 = I refuse to be the average of a handful. I have a reputation.
