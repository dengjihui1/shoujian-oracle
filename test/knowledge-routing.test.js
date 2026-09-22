import assert from "node:assert/strict";
import test from "node:test";
import { citationRepairInstruction, decideKnowledgeRoute, groundedUnavailableReply, isExplicitZhouyiQuery } from "../server/knowledge-routing.mjs";

const evidence = (matchScore, matchedBy = []) => [{ id: "ZY-01-LINE-1", matchScore, matchedBy }];

test("ordinary chat discards a weak accidental retrieval", () => {
  const decision = decideKnowledgeRoute({ message: "今天适合穿什么？", purpose: "chat", evidence: evidence(8) });
  assert.equal(decision.groundingRequested, false);
  assert.deepEqual(decision.evidence, []);
  assert.equal(decision.reason, "ordinary-chat");
});

test("explicit Zhouyi questions keep retrieved evidence", () => {
  assert.equal(isExplicitZhouyiQuery("《周易》的卦辞怎么理解？"), true);
  const decision = decideKnowledgeRoute({ message: "《周易》的卦辞怎么理解？", purpose: "chat", evidence: evidence(8) });
  assert.equal(decision.groundingRequested, true);
  assert.equal(decision.evidence.length, 1);
  assert.equal(decision.reason, "explicit-zhouyi");
});

test("strong lexical evidence keeps a named classical phrase grounded", () => {
  const decision = decideKnowledgeRoute({ message: "潜龙勿用是什么意思？", purpose: "chat", evidence: evidence(46) });
  assert.equal(decision.groundingRequested, true);
  assert.equal(decision.reason, "strong-retrieval");
});

test("divination uses the grounded route even before evidence is available", () => {
  const decision = decideKnowledgeRoute({ message: "这门生意怎么样？", purpose: "divination", evidence: [] });
  assert.equal(decision.groundingRequested, true);
  assert.equal(decision.reason, "divination");
});

test("citation repair only permits the evidence retrieved in this turn", () => {
  const instruction = citationRepairInstruction([{ id: "ZY-01-LINE-1" }, { id: "SG-QIAN" }]);
  assert.match(instruction, /【ZY-01-LINE-1】、【SG-QIAN】/u);
  assert.match(instruction, /不得使用列表之外/u);
  assert.match(groundedUnavailableReply(), /依据核对完整/u);
});
