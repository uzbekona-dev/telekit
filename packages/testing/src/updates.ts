import type {
  Chat,
  ChatMember,
  ChatMemberStatus,
  Contact,
  Document,
  InlineQuery,
  Location,
  Message,
  PhotoSize,
  Update,
  User,
} from "@telekit/core";

/** Who is "typing" and where — the defaults every synthetic update is built from. */
export interface UpdateScope {
  user: User;
  chat: Chat;
}

export interface PhotoInput {
  file_id?: string;
  caption?: string;
  width?: number;
  height?: number;
  file_size?: number;
}

export interface DocumentInput {
  file_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  caption?: string;
}

export type ContactInput = Partial<Contact> & { phone_number: string };

export type ChatMemberInput = ChatMember | ChatMemberStatus;

export interface ChatMemberUpdateInput {
  old_chat_member: ChatMemberInput;
  new_chat_member: ChatMemberInput;
}

/** Builds realistic Bot API `Update` payloads with monotonically increasing ids (dedup would otherwise drop repeats — spec §14.2). */
export class UpdateFactory {
  private nextUpdateId = 1;
  private nextIncomingMessageId = 1_000_000;
  private nextQueryId = 1;
  private nextFileNumber = 1;

  /** A fresh, unique `file_id` such as `photo_3` — for synthetic media and uploaded fixtures. */
  fileId(kind: string): string {
    return `${kind}_${this.nextFileNumber++}`;
  }

  private base(): { update_id: number } {
    return { update_id: this.nextUpdateId++ };
  }

  private messageBase(scope: UpdateScope): Message {
    return {
      message_id: this.nextIncomingMessageId++,
      date: Math.floor(Date.now() / 1000),
      chat: scope.chat,
      from: scope.user,
    };
  }

  message(scope: UpdateScope, fields: Partial<Message>): Update {
    return { ...this.base(), message: { ...this.messageBase(scope), ...fields } };
  }

  text(scope: UpdateScope, text: string): Update {
    return this.message(scope, { text });
  }

  command(scope: UpdateScope, name: string, args?: string): Update {
    const command = `/${name.replace(/^\//, "")}`;
    const text = args ? `${command} ${args}` : command;
    return this.message(scope, {
      text,
      entities: [{ type: "bot_command", offset: 0, length: command.length }],
    });
  }

  photo(scope: UpdateScope, input: PhotoInput = {}): Update {
    const fileId = input.file_id ?? this.fileId("photo");
    const size: PhotoSize = {
      file_id: fileId,
      file_unique_id: `u_${fileId}`,
      width: input.width ?? 1280,
      height: input.height ?? 720,
      ...(input.file_size !== undefined ? { file_size: input.file_size } : {}),
    };
    return this.message(scope, {
      photo: [size],
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
    });
  }

  document(scope: UpdateScope, input: DocumentInput = {}): Update {
    const fileId = input.file_id ?? this.fileId("document");
    const document: Document = {
      file_id: fileId,
      file_unique_id: `u_${fileId}`,
      ...(input.file_name !== undefined ? { file_name: input.file_name } : {}),
      ...(input.mime_type !== undefined ? { mime_type: input.mime_type } : {}),
      ...(input.file_size !== undefined ? { file_size: input.file_size } : {}),
    };
    return this.message(scope, {
      document,
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
    });
  }

  contact(scope: UpdateScope, input: ContactInput): Update {
    const contact: Contact = { first_name: scope.user.first_name, user_id: scope.user.id, ...input };
    return this.message(scope, { contact });
  }

  location(scope: UpdateScope, location: Location): Update {
    return this.message(scope, { location });
  }

  callback(scope: UpdateScope, data: string, messageId: number | undefined): Update {
    return {
      ...this.base(),
      callback_query: {
        id: String(this.nextQueryId++),
        from: scope.user,
        chat_instance: `ci_${scope.chat.id}`,
        data,
        message: {
          message_id: messageId ?? this.nextIncomingMessageId++,
          date: Math.floor(Date.now() / 1000),
          chat: scope.chat,
        },
      },
    };
  }

  inlineQuery(scope: UpdateScope, query: string, offset = "", chatType?: InlineQuery["chat_type"]): Update {
    return {
      ...this.base(),
      inline_query: {
        id: String(this.nextQueryId++),
        from: scope.user,
        query,
        offset,
        ...(chatType !== undefined ? { chat_type: chatType } : {}),
      },
    };
  }

  chosenInlineResult(scope: UpdateScope, resultId: string, query: string, inlineMessageId?: string): Update {
    return {
      ...this.base(),
      chosen_inline_result: {
        result_id: resultId,
        from: scope.user,
        query,
        ...(inlineMessageId !== undefined ? { inline_message_id: inlineMessageId } : {}),
      },
    };
  }

  chatMember(scope: UpdateScope, input: ChatMemberUpdateInput): Update {
    return {
      ...this.base(),
      chat_member: {
        chat: scope.chat,
        from: scope.user,
        date: Math.floor(Date.now() / 1000),
        old_chat_member: toChatMember(input.old_chat_member, scope.user),
        new_chat_member: toChatMember(input.new_chat_member, scope.user),
      },
    };
  }

  /** Escape hatch: stamps a fresh `update_id` onto any hand-written payload. */
  raw(update: Omit<Update, "update_id">): Update {
    return { ...this.base(), ...update };
  }
}

function toChatMember(input: ChatMemberInput, user: User): ChatMember {
  return typeof input === "string" ? { status: input, user } : input;
}

export function privateChatFor(user: User): Chat {
  return {
    id: user.id,
    type: "private",
    first_name: user.first_name,
    ...(user.username !== undefined ? { username: user.username } : {}),
  };
}
