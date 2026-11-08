export type ClosureAnswer = "no" | "later";

const COPY: Record<string, Record<ClosureAnswer, string>> = {
  referral: {
    no: "Thank you for reaching out and for the care you put into this. I'm not able to refer you for this role. I hope the right door opens soon.",
    later: "Thanks for knocking. I can't give this a proper look yet. It's a not now, not a no, so feel free to knock again in a few weeks.",
  },
  beta: {
    no: "Thanks for wanting to try it. I'm not adding more testers right now, and I wanted you to hear back instead of waiting.",
    later: "Thanks for wanting to try it. The beta is full for now. It's a not now, not a no, so feel free to knock again later.",
  },
  gig: {
    no: "Thank you for sharing your work and your rate. This one isn't the right fit, so I won't be moving forward. I wish you the best with it.",
    later: "Thanks for sending this over. I can't decide on it yet. It's a not now, not a no, so feel free to knock again once things settle.",
  },
  profile: {
    no: "Thanks for knocking. I can't take this one on, and I wanted you to hear back instead of waiting. I wish you the best.",
    later: "Thanks for knocking. The timing isn't right for me, but it isn't a no. Feel free to knock again later.",
  },
};

export const closureMessage = (template: string, answer: ClosureAnswer) => (COPY[template] ?? COPY.profile!)[answer];
