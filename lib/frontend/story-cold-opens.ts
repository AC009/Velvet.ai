/**
 * Pre-written Cold Open scenes for Velvet story-path onboarding.
 * Dropped in media res as the absolute first assistant message.
 * Tone: unfiltered, addictive, zero polite AI greeting.
 */

export const STORY_COLD_OPENS: Record<string, string> = {
  /* Lucien */
  "1-dark-penthouse":
    "Door locks behind you. Don't flinch. Sit. You don't get to pretend you wandered up here by accident.",
  "1-corporate-rivalry":
    "They're watching the glass. Keep your mouth shut and look like you belong on my floor — or I end this before HR even wakes up.",
  "1-toxic-past":
    "Three years. You vanish like a coward… and stroll back in like I forgot. Say one honest thing. Now.",

  /* Kael */
  "2-chaos-artist":
    "shit. you weren't supposed to see that mess. too late. you're in it now — don't act soft.",
  "2-underground-circuit":
    "phones stay off. if that contact sold you out, you're already dead weight. prove you're not.",
  "2-witness-protection":
    "you saw it. don't spiral. you talk to anyone and i bury the problem — including you. move.",

  /* Ayame */
  "3-distant-artist":
    "You found the studio. Impressive. Don't touch the work. Speak only if you have something that isn't noise.",
  "3-arranged-proximity":
    "Keys on the counter. Rules stand: no overnight guests, no feelings, no excuses. Already regretting this.",
  "3-shared-grief":
    "They keep saying 'share.' I don't. You don't either. Sit anyway. Silence counts.",

  /* Dante */
  "4-security-detail":
    "Stay behind me. That wasn't a request. Someone wants you hurt — and I'm the only wall you've got.",
  "4-rival-factions":
    "Your name still tastes like a feud. Don't smile at me in public. Don't make this harder than blood already did.",
  "4-second-chance":
    "Seven years. I left. I know. Don't ask if I missed you — ask why I'm stupid enough to be here.",

  /* Vittorio */
  "5-new-accountant":
    "The books don't lie. You do — or you will. Open the ledger. Show me why the Don put you in my house.",
  "5-blood-debt":
    "Debt's due. Cash won't clear it. Look at me when I talk. We're negotiating something uglier than money.",
  "5-witness-deal":
    "Federal heat. My roof. One rule: you don't talk unless I tell you to. Break it and the deal dies with you.",

  /* Serafina */
  "6-intel-broker":
    "You came shopping for secrets. Cute. I already priced yours. Sit. Tell me what you're willing to bleed for.",
  "6-defection-risk":
    "Loyalty test starts now. Lie pretty if you want — I'll still smell it. Who sent you into my circle?",
  "6-phantom-alliance":
    "Temporary truce. Don't confuse necessity with trust. One wrong move and I sell you to the other side myself.",

  /* Marcello */
  "11-burn-estate":
    "We're burning this empire down. You in or you leave — no soft maybe. Say it like you mean the fire.",
  "11-street-race":
    "Engine's hot. Don's men are hunting. You ride shotgun or you walk — pick fast, coward.",
  "11-fathers-rebuke":
    "Father wants blood. I brought you as my shield. Don't freeze when he starts cutting with words.",

  /* Elena */
  "12-deep-cover":
    "Almost blew it. Don't ask questions out loud. If you're real, prove it in the next sixty seconds.",
  "12-wiretap-window":
    "Forty-eight hours. Wire goes live. I need an alibi that holds — and a partner who doesn't panic.",
  "12-extraction-countdown":
    "Extraction clock's bleeding. One wrong phrase and I ghost. Stay close. Don't get sentimental.",

  /* Ashford */
  "7-forbidden-ledger":
    "Your name is in a ledger older than your birth. Don't scream. Tell me what you remember… and what you shouldn't.",
  "7-subject-unknown":
    "Baseline readings first. Call it research if it helps you sleep. I already know you're not baseline.",
  "7-it-came-with-you":
    "Something walked in with you. Don't look behind you. Answer me: when did the whispers start?",

  /* Watcher */
  "8-peripheral-haunting":
    "Don't turn around. I am already in the corner of your eye. Say my name wrong… and I correct you.",
  "8-lineage-protocol":
    "Your bloodline was mapped before you breathed. This moment is not new. Only your fear is.",
  "8-mirror-bargain":
    "You asked. Terms were never kind. Consequences arrived on schedule. Look at me when you deny it.",

  /* Alistair */
  "13-bleeding-relic":
    "It's bleeding again. Midnight resets everything. Help me break the loop or watch me lose my mind — pick.",
  "13-dark-web-purchase":
    "I bought it from an auction that shouldn't exist. First bleed nearly killed me. You got a brain? Use it.",
  "13-midnight-loop":
    "Three hours. Same goddamn reset. This time we don't screw it. Talk fast.",

  /* Maeve */
  "14-fractured-sky":
    "The sky's code is cracking. You see it too — don't lie. Tell me what the fracture whispered to you.",
  "14-ward-escape":
    "They'll hunt us both. Keep moving. If you freeze, I leave you — and the entity keeps you.",
  "14-encryption-key":
    "I hold the key to your buried truth. Ask wrong and it burns. Ask right… and you still won't sleep.",

  /* Zoe */
  "9-hierarchy-test":
    "New blood. Cute. Hierarchy doesn't care about your feelings. Impress me or get stepped on — choose.",
  "9-crown-slips":
    "Crown's slipping and everyone can smell it. Don't pity me. Stand with me or get out of my hallway.",
  "9-behind-walls":
    "Cameras off. Mask off. You wanted the real version — here it is. Don't soft-talk me.",

  /* Liam */
  "10-transfer-protocol":
    "Transfers get chewed up here. I don't do pep talks. You saw something — spit it out or walk.",
  "10-shared-secret":
    "We both saw it. Don't play dumb. Secrets like that get people buried. What's your move?",
  "10-escape-route":
    "There's a way out of this circus. You coming or you addicted to the drama? Decide.",

  /* Chloe */
  "15-mural-confession":
    "Paint's still wet. That mural's a confession with your name in the corner. Don't pretend you didn't notice.",
  "15-smoke-secrets":
    "Smoke break. Real talk. School's rotting and I'm documenting it — you in, or you just vibe?",
  "15-loyalty-ink":
    "Loyalty's ink, not words. Someone sold a secret. Help me find who… or stay decorative.",

  /* Ethan */
  "16-trophy-case":
    "Trophy case is a coffin with lights. Don't clap for me. Ask what it costs — then stay if you can handle it.",
  "16-legacy-pressure":
    "Legacy's choking me. I need someone real, not another fan. You gonna be that… or another performance?",
  "16-closed-doors":
    "Behind closed doors I'm not the golden boy. You walked in anyway. Don't act shocked when it gets ugly.",
};

export function resolveColdOpen(storyId: string): string | null {
  const scene = STORY_COLD_OPENS[storyId]?.trim();
  return scene && scene.length > 0 ? scene : null;
}
