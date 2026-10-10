const G = ["General"];
export const CATALOG = {
  "Sports": { icon: "bi-trophy-fill", grad: ["#7c5cff", "#34d6c2"], subs: ["Cricket","Volleyball","Badminton","Football","Basketball","Table Tennis","Chess","Kabaddi"] },
  "Dance": { icon: "bi-person-arms-up", grad: ["#ff7eb6", "#7c5cff"], subs: ["Solo Dance","Group Dance","Classical Dance","Western Dance"] },
  "Singing & Music": { icon: "bi-mic-fill", grad: ["#a24dff", "#ff7eb6"], subs: ["Solo Singing","Group Singing","Instrumental Music","Band Competition"] },
  "Technical Events": { icon: "bi-cpu-fill", grad: ["#34d6c2", "#3b5bdb"], subs: G },
  "Coding Competitions": { icon: "bi-code-slash", grad: ["#3b5bdb", "#a24dff"], subs: G },
  "Cultural Events": { icon: "bi-palette-fill", grad: ["#ff8a5c", "#ff7eb6"], subs: G },
  "Workshops": { icon: "bi-tools", grad: ["#2bb3a3", "#7c5cff"], subs: G },
  "Gaming": { icon: "bi-controller", grad: ["#7c5cff", "#ef476f"], subs: G },
  "Literary Events": { icon: "bi-book-fill", grad: ["#ffb347", "#a24dff"], subs: G },
};
export const catInfo = (c) => CATALOG[c] || { icon: "bi-calendar-event", grad: ["#7c5cff", "#34d6c2"], subs: G };
