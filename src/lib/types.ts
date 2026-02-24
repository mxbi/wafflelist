export interface User {
	id: string;
	username: string;
	password_hash: string;
	encryption_public_key: string | null;
	created_at: number;
}

export interface List {
	id: string;
	user_id: string;
	name: string;
	icon: string | null;
	sort_order: number;
	created_at: number;
}

export interface Todo {
	id: string;
	user_id: string;
	list_id: string | null;
	title: string;
	notes: string | null;
	due_date: string | null;
	reminder_date: string | null;
	snoozed_until: string | null;
	completed_at: string | null;
	sort_order: number;
	created_at: number;
}

export interface EncryptedTodo {
	id: string;
	user_id: string;
	encrypted_blob: string;
	updated_at: number;
}

export interface EncryptedList {
	id: string;
	user_id: string;
	encrypted_blob: string;
	updated_at: number;
}
