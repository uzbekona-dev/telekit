import { describe, expect, it } from "vitest";
import { resolveEventTypes, type Message, type Update, type User } from "../src/index.js";

const user: User = { id: 1, is_bot: false, first_name: "Ali" };
const chat = { id: 1, type: "private" as const };

function message(fields: Partial<Message>): Message {
  return { message_id: 1, date: 0, chat, from: user, ...fields };
}

describe("resolveEventTypes", () => {
  it("orders a text message as message:text, then the catch-all message:any", () => {
    expect(resolveEventTypes({ update_id: 1, message: message({ text: "salom" }) })).toEqual([
      "message:text",
      "message:any",
    ]);
  });

  it("maps every media field to its message:* event, most specific first", () => {
    const cases: Array<[Partial<Message>, string]> = [
      [{ photo: [{ file_id: "p", file_unique_id: "p", width: 1, height: 1 }] }, "message:photo"],
      [{ video: { file_id: "v", file_unique_id: "v", width: 1, height: 1, duration: 1 } }, "message:video"],
      [{ audio: { file_id: "a", file_unique_id: "a", duration: 1 } }, "message:audio"],
      [{ voice: { file_id: "vo", file_unique_id: "vo", duration: 1 } }, "message:voice"],
      [{ document: { file_id: "d", file_unique_id: "d" } }, "message:document"],
      [{ animation: { file_id: "an", file_unique_id: "an", width: 1, height: 1, duration: 1 } }, "message:animation"],
      [{ sticker: { file_id: "s", file_unique_id: "s", type: "regular", width: 1, height: 1, is_animated: false, is_video: false } }, "message:sticker"],
      [{ contact: { phone_number: "+998", first_name: "Ali" } }, "message:contact"],
      [{ location: { latitude: 41.3, longitude: 69.2 } }, "message:location"],
      [{ poll: { id: "q", question: "?", options: [], total_voter_count: 0, is_closed: false, is_anonymous: true, type: "regular", allows_multiple_answers: false } }, "message:poll"],
    ];

    for (const [fields, expected] of cases) {
      expect(resolveEventTypes({ update_id: 1, message: message(fields as Partial<Message>) })).toEqual([expected, "message:any"]);
    }
  });

  it("a captioned photo is not a text message", () => {
    const update: Update = {
      update_id: 1,
      message: message({ caption: "rasm", photo: [{ file_id: "p", file_unique_id: "p", width: 1, height: 1 }] }),
    };
    expect(resolveEventTypes(update)).toEqual(["message:photo", "message:any"]);
  });

  it("resolves every non-message update kind", () => {
    const member = { status: "member" as const, user };
    const memberUpdate = { chat, from: user, date: 0, old_chat_member: member, new_chat_member: member };
    const cases: Array<[Omit<Update, "update_id">, string]> = [
      [{ edited_message: message({ text: "x" }) }, "edited_message"],
      [{ channel_post: message({ text: "x" }) }, "channel_post"],
      [{ edited_channel_post: message({ text: "x" }) }, "edited_channel_post"],
      [{ callback_query: { id: "1", from: user, chat_instance: "c", data: "d" } }, "callback_query"],
      [{ inline_query: { id: "1", from: user, query: "q", offset: "" } }, "inline_query"],
      [{ chosen_inline_result: { result_id: "r", from: user, query: "q" } }, "chosen_inline_result"],
      [{ chat_member: memberUpdate }, "chat_member"],
      [{ my_chat_member: memberUpdate }, "my_chat_member"],
      [{ chat_join_request: { chat, from: user, user_chat_id: 1, date: 0 } }, "chat_join_request"],
      [{ poll: { id: "q", question: "?", options: [], total_voter_count: 0, is_closed: false, is_anonymous: true, type: "regular", allows_multiple_answers: false } }, "poll"],
      [{ poll_answer: { poll_id: "q", option_ids: [0], user } }, "poll_answer"],
    ];

    for (const [fields, expected] of cases) {
      expect(resolveEventTypes({ update_id: 1, ...fields } as Update)).toEqual([expected]);
    }
  });

  it("returns no event types for an update with no known payload", () => {
    expect(resolveEventTypes({ update_id: 1 })).toEqual([]);
  });
});
