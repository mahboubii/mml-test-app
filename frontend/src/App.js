import { useState, useEffect, useCallback } from 'react';
import { StreamChat } from 'stream-chat';
import { Chat, Channel, MessageInput, ChannelHeader, ChannelList, VirtualizedMessageList } from 'stream-chat-react';

import 'stream-chat-react/dist/css/index.css';
import './App.css';

const apiKey = 'YOUR_API_KEY'; // grab your key from https://getstream.io/dashboard/
const user = { id: 'jim', name: 'Jim' };
// you can generate user token using your app secret via https://getstream.io/chat/docs/token_generator/
const token = 'YOUR_USER_GENERATED_TOKEN';

function App() {
  const [chatClient] = useState(new StreamChat(apiKey)); // important to init chatClient only once, you can replace this with useMemo
  const [loading, setLoading] = useState(true); // used to render a loading UI until client successfully is connected

  useEffect(() => {
    if (loading) chatClient.connectUser(user, token).then(() => setLoading(false)); // client connects(async) with provided user token
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createNewChannel = useCallback(async () => {
    // we need a way to create new channels with current user as the member
    // this func allows us to create random channels
    const channelId = Math.random().toString(36).substring(7);
    await chatClient.channel('messaging', channelId, { name: channelId.toUpperCase(), members: [user.id] }).create();
  }, [chatClient]);

  if (loading) return <div>Loading...</div>;

  return (
    <Chat client={chatClient}>
      <button onClick={createNewChannel}>Creat a New Channel</button>
      <ChannelList filters={{ members: { $in: [user.id] } }} options={{ state: true, watch: true, presence: true }} />
      <Channel>
        <ChannelHeader />
        <VirtualizedMessageList />
        <MessageInput />
      </Channel>
    </Chat>
  );
}

export default App;
