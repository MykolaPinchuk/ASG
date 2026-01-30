## random notes after viewing replays

it appears that many models do not seem to understand how node belonging works. they often try to move into nodes that are already owned by them and seem to assume that by doing so they are "capturing" the node. 

maybe it is useful to give 'turn 0' to agent. we can explciitly tel agents to think hard about rules and win vonsitions and reason about what they mean and what possible startegies can be. so such turn 0 may be purely "thinking" turn where no actions are taken but agents can reason about the game state and plan ahead.

agents seem to often get confused about which moves and actions are valid actions. like they often fail to relize that they can collect resurces and use them to spawn units. they often seem to view combat as invalid action. I am wondering whether it may be useful to give some kind of game0 as an experimentation sandbox. so agent will be directly encouraged to play game0 not to win, but to experiment to better understand the rules and game mechanics. in a sense, this will allow an agent t start the main scored game with some basic understanding of the game mechanics and thoughts on startegies rather than starting from a blank state in an environment where pressure to get results quickly may lead to suboptimal exploration of the game mechanics.

separately, it may be useful to let an agent to run 2 full games. so first it does game1 (scores and recorded). then it has 1 min of thinking time to analyse logs from game 1, think what it means, and learn something. then it will do game2.

Actually, it seems that we do not provide any past information to agents. So it appears that each tunr is stateless. for our very simple current setup it is ok. but in general we should soon move to some information persistence.
