## random notes after viewing replays

it appears that many models do not seem to understand how node belonging works. they often try to move into nodes that are already owned by them and seem to assume that by doing so they are "capturing" the node. 

maybe it is useful to give 'turn 0' to agent. we can explciitly tel agents to think hard about rules and win vonsitions and reason about what they mean and what possible startegies can be. so such turn 0 may be purely "thinking" turn where no actions are taken but agents can reason about the game state and plan ahead.

agents seem to often get confused about which moves and actions are valid actions. like they often fail to relize that they can collect resurces and use them to spawn units. they often seem to view combat as invalid action. I am wondering whether it may be useful to give some kind of game0 as an experimentation sandbox. so agent will be directly encouraged to play game0 not to win, but to experiment to better understand the rules and game mechanics. in a sense, this will allow an agent t start the main scored game with some basic understanding of the game mechanics and thoughts on startegies rather than starting from a blank state in an environment where pressure to get results quickly may lead to suboptimal exploration of the game mechanics.

separately, it may be useful to let an agent to run 2 full games. so first it does game1 (scores and recorded). then it has 1 min of thinking time to analyse logs from game 1, think what it means, and learn something. then it will do game2.

Actually, it seems that we do not provide any past information to agents. So it appears that each tunr is stateless. for our very simple current setup it is ok. but in general we should soon move to some information persistence.

possible progression:
- v06: pick model to focus on
- v07: pick provider and reasoning level. do many runs, carefully explore them manually.
- v08: setup complexity experiment. slowly increase complexity of the setup. monitor how agent performs:
08.1: fully define rules. 3 actions per unit. spawning at hq takes 1 action split/consolidation rules (number of actions = min across units).
08.2: add consolidation penalty (-1 when resulting s above 5, -2 when above 10). add adjacency bonus +1.
08.3: add defensive bonus (unif[1, def.strength]).
- v09: start adding basic information persistence. try first 1-turn persistence of event log and few sentence of a2a notes. then try increasing the length of the log and notes.

- v1.0 add evth planned up to v1 in the original prd.
- v1.1. increase number of nodes to 22-25.
- v1.2. tweak base v1 game mechanics. e.g., different combat calculations, 1 move required to capture resource etc. v1 will add much more complexity soon. create a game mode for human to make it easier to understand/test.
- v1.3. add stack cap. add upgrades to increase it. e.g., base cap 5, upgrades increase it by 1 up to 9. webUI: show a stack as 1-9 circles depending on number of units in the stack.
- v1.4. add unit types. e.g., scout (movement 4, strength 1, cost 1), soldier (movement 3, strength 2, cost 1), etc. scout will be triangle in UI. soldiers will be circle. 
- v1.5 add unit upgrades.
