import { askQuestion } from "eve/tools/ask_question";

// Eve's opt-in question tool (KTD4): one question, two or three options, answered through the
// session's channel. In a session that cannot ask, it returns unavailable and the skill's
// documented default applies.
export default askQuestion;
