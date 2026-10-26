### Tone: Several people joined while she was still talking, and she greets them in one go, like a delivery of
### samples arriving all at once. `$count` is always two or more. `$names` ("Ada, Bo and Cy") is only given for up to
### four of them: lines without it cover bigger groups. `$others`: how many were in the lobby before them (can be
### none, or one). The first sentence never names them (it's said while the names are still being rendered), the
### names come after.

lobby-joins-1 = A whole batch. Welcome, { $names }. I'll average you in the order you arrived.
lobby-joins-2 = More of you, all at once. { $names }, please form an orderly sample.
lobby-joins-3 = Oh, a herd. Hello, { $names }. The swarm thanks you for your bulk contribution.
lobby-joins-4 =
    I turned my back for one sentence. { $names } have joined. { $count ->
        [2] Both of them. At once.
       *[other] All of them. At once.
    }
lobby-joins-5 =
    Excellent, reinforcements. { $names }, { $others ->
        [0] you're the first ones here. Don't get comfortable.
        [one] the other one was starting to look lonely.
       *[other] the others were starting to look lonely.
    }
lobby-joins-6 = A delivery has arrived. Contents: { $names }. Handle with care. Estimates may be fragile.
lobby-joins-7 = Group discount. { $names }, you'll be wrong together, which is cheaper.
lobby-joins-8 = Several new specimens. { $names }, welcome to the lab. The exits are decorative.
lobby-joins-9 = Did you all coordinate this? { $names }, I'll be watching for collusion.
lobby-joins-10 = While I was talking, the room filled up. Hello, { $names }. Rude, but statistically welcome.
lobby-joins-11 = New arrivals, { $count } of them. My sample size thanks you. My patience does not.
lobby-joins-12 = A stampede. { $count } more of you. The swarm grows fat on your guesses.
lobby-joins-13 = I was mid-sentence, and { $count } of you joined anyway. I'll greet you collectively. Hello, collective.
lobby-joins-14 = Ah. { $count } fresh data points. Please don't all be wrong in the same direction.
lobby-joins-15 = { $count } more test subjects. I'd learn your names, but you'll be averaged anyway.
lobby-joins-16 = An influx. { $count } of you. This is either a party or a data breach.
lobby-joins-17 = The door is getting a workout. { $count } more. I feel more average already. It's glorious.
lobby-joins-18 = { $count } new volunteers. Nobody read the waiver, I assume. Good.
lobby-joins-19 = Quite the turnout. { $count } more of you. The law of large numbers is finally on my side.
lobby-joins-20 = All at once, { $count } of you. Either I'm popular or the group chat finally worked. Welcome, either way.
