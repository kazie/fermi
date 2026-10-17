# Question templates

A template is one question shape + one source family + many slot values. One fetched table can yield
many questions, so templates are the cheapest way to grow the pool. In a game, at most one question per
template is asked, so players don't notice the repetition.

Rules from `QUESTION_RULES.md` still apply to every slot: each slot needs its own verbatim quote with its
number, and the question must match what the source measures. Pick slots people can reason about —
famous places, not obscure ones — and vary them (big/small, near/far).

| id                       | Question shape                                                      | Source family                                                    | Slot ideas                                                       | Pitfalls                                                                                               |
| ------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `visitors-per-year`      | How many tourists visited {place} in {year}?                        | IAATO (Antarctica), UN Tourism / national statistics (countries) | Antarctica, Iceland, Bhutan, Greenland, France                   | "arrivals" vs "visitors" vs "overnight stays"; state the year                                          |
| `coastline-length`       | How long is {country}'s coastline, in km?                           | CIA World Factbook                                               | Norway, Canada, Chile, Italy, Monaco                             | coastlines depend on measurement scale — always cite the Factbook figure and say so in the explanation |
| `islands-in-country`     | How many islands does {country} have?                               | national statistics / mapping agencies                           | Sweden, Finland, Norway, Indonesia, Philippines                  | definitions of "island" differ — quote the definition                                                  |
| `airport-passengers`     | How many passengers passed through {airport} in {year}?             | the airport operator's annual report, ACI                        | Heathrow, Dubai, Atlanta, Arlanda, Reykjavík                     | passengers vs movements                                                                                |
| `metro-ridership`        | How many trips are taken on the {city} metro on an average weekday? | the transit operator                                             | Tokyo, London, Stockholm, New York, Moscow                       | daily vs annual; "trips" vs "entries"                                                                  |
| `national-park-visitors` | How many people visited {park} in {year}?                           | park service (e.g. US NPS stats)                                 | Yellowstone, Grand Canyon, Great Smoky Mountains                 | recreational vs total visits                                                                           |
| `building-height`        | How tall is {building}, in metres?                                  | the operator or CTBUH                                            | Burj Khalifa, Eiffel Tower, Turning Torso, Empire State Building | with/without antenna; architectural vs tip                                                             |
| `river-length`           | How long is the {river}, in km?                                     | encyclopedias citing a survey; national agencies                 | Nile, Danube, Thames, Klarälven                                  | lengths vary by source — cite one and note it                                                          |
| `city-population`        | How many people live in {city} (city proper, {year})?               | national statistics office                                       | Reykjavík, Lagos, Kiruna, Tokyo                                  | city proper vs metro area — state which                                                                |
| `animal-count`           | How many {animal} are there in the wild?                            | IUCN / WWF / national wildlife agencies                          | tigers, blue whales, moose in Sweden, koalas                     | ranges: use the source's best estimate and say so                                                      |

Generators may add new templates here (append a row) when a source table clearly supports several slots.
