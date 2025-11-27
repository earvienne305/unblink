import { getAgentResponsesByAgent, getAllAgentResponses, getAllMedia, getAllMoments } from "./utils";

// const mediaRes = await getAllMedia()
// console.log("All media:", mediaRes);

// const res = await getAllMoments()
// console.log("All moments:", res);

const res = await getAllAgentResponses()
console.log("All agent responses:", res);