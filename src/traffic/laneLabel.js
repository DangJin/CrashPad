// Lane IDs stay tied to the entrance when lanes are added or removed.
export const laneLabel = lane => lane < 0 ? `新增左 ${-lane}` : `车道 ${lane + 1}`;
