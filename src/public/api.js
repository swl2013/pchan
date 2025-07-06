export async function PostTo(board, data) {
  const response = await fetch(`/${board}/post`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to post');
  return await response.json();
}

export async function ReplyTo(board, data) {
  const response = await fetch(`/${board}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to reply');
  return await response.json();
}

export async function FetchPosts(board) {
  const response = await fetch(`/${board}/posts`);
  if (!response.ok) throw new Error('Failed to fetch posts');
  return await response.json();
}
