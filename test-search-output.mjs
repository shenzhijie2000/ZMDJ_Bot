import assert from "node:assert/strict";

function listMessage(matches) {
  const names = matches
    .slice(0, 10)
    .map((card) => `${card.serial_number} ${card.name}`);
  const suffix = matches.length > 10 ? "\n……（结果过多，请输入更完整的卡名）" : "";
  return `查询到以下 ${matches.length} 张卡牌：\n${names.join("\n")}${suffix}\n\n输入完整卡号查看卡图。`;
}

const output = listMessage([
  { serial_number: "BP01-C-136", name: "寒流袭来" },
  { serial_number: "BP01-UC-136", name: "寒流袭来" },
  { serial_number: "BP01-R-136", name: "寒流袭来" },
]);

assert.match(output, /查询到以下 3 张卡牌/);
assert.match(output, /BP01-C-136 寒流袭来/);
assert.match(output, /BP01-UC-136 寒流袭来/);
assert.match(output, /BP01-R-136 寒流袭来/);
assert.match(output, /输入完整卡号查看卡图/);
console.log("PASS: duplicate card names remain distinguishable by serial number");
