// A first set written from how the product behaves. Replace or reorder from the Talk to Bharath log as real questions arrive.
export type Faq = { q: string; a: string };

export const FAQ: Faq[] = [
  { q: "Do I need an account to knock?", a: "No. You give an email, a short message and the answers the door asks for. The DM checker needs no account either." },
  { q: "How long until I get an answer?", a: "Every door promises 3, 7 or 14 days. If the receiver does not get to your knock in that time, it closes and you get an email saying they did not get to it." },
  { q: "What do Yes, Not now and No mean?", a: "Yes sends you the receiver's booking link or an invite code. Not now means try again later, and you get the date and one reminder. No comes with a kind note, and the receiver can add a reason." },
  { q: "Can I knock again?", a: "You can knock a door once. After a Not now, or a knock that ran out of time, you can knock again 90 days after it closed. We email you when that day comes for a Not now." },
  { q: "How do I follow my knock?", a: "Your receipt email has a private status link. It shows Delivered, then Seen, then the answer, with times. Anyone with the link can see the status, so keep it private." },
  { q: "What does the AI do?", a: "It scores how well a knock fits the post, and flags likely spam, so receivers see the best knocks first. It never answers for them. Anthropic processes the text for this, as listed on the privacy page." },
  { q: "How do I delete my knock?", a: "Open the status link from your receipt and choose Delete my knock. Otherwise it is deleted automatically 90 days after it closes." },
  { q: "How do I make a door?", a: "Paste your post on the make-a-door page, pick a template, and put the link in your reply or bio. You get one profile door too, for anyone to ask you anything." },
  { q: "How do I sign in?", a: "Enter your email on the sign-in page and open the link we send. The link works once and expires in 15 minutes. You can sign out of every device from your settings." },
  { q: "How do I reach a human?", a: "Use the Talk to Bharath link on any screen or in any email. Bharath replies within 24 hours." },
];
