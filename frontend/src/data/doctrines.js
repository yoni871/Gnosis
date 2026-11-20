// Planned doctrine categories for the Trace the Doctrine homepage.
//
// These are PLANNED categories, not published studies: no doctrine
// study workspace exists yet and no theological research content has
// been written. Descriptions are brief, neutral category summaries —
// they make no research claims and name no sources. Keep them that
// way until a study is actually published.

export const DOCTRINES = [
    {
        id: "trinity",
        numeral: "I",
        title: "The Trinity",
        description: "One God in three persons — Father, Son, and Holy Spirit.",
        keywords: ["god", "three persons", "father", "son", "holy spirit", "nicene", "council"],
        featured: true,
    },
    {
        id: "incarnation",
        numeral: "II",
        title: "The Incarnation",
        description: "The Son of God taking on human nature in Jesus Christ.",
        keywords: ["jesus", "christ", "human nature", "son of god", "nativity"],
        featured: false,
    },
    {
        id: "salvation",
        numeral: "III",
        title: "Salvation",
        description: "How God rescues and restores humanity through Christ.",
        keywords: ["grace", "faith", "redemption", "atonement", "justification"],
        featured: false,
    },
    {
        id: "holy-spirit",
        numeral: "IV",
        title: "The Holy Spirit",
        description: "The Spirit's person and work in Scripture and the Church.",
        keywords: ["spirit", "pentecost", "gifts", "sanctification"],
        featured: false,
    },
    {
        id: "church",
        numeral: "V",
        title: "The Church",
        description: "The people of God gathered, sent, and sustained through history.",
        keywords: ["ecclesiology", "congregation", "sacraments", "mission"],
        featured: false,
    },
    {
        id: "resurrection",
        numeral: "VI",
        title: "The Resurrection",
        description: "Christ's rising from the dead and the hope it gives believers.",
        keywords: ["easter", "empty tomb", "eternal life", "hope"],
        featured: false,
    },
];

export function searchDoctrines(query) {
    const needle = query.trim().toLowerCase();
    if (!needle) return DOCTRINES;
    return DOCTRINES.filter((doctrine) =>
        [doctrine.title, doctrine.description, ...doctrine.keywords]
            .join(" ")
            .toLowerCase()
            .includes(needle),
    );
}
