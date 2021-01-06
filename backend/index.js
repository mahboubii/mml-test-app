const express = require('express');
const bodyParser = require('body-parser');
const localtunnel = require('localtunnel');
const { StreamChat } = require('stream-chat');

const port = 8000;
const apiKey = 'YOUR_API_KEY';
const secret = 'YOUR_API_SECRET';
const chatClient = new StreamChat(apiKey, secret);

// mock function, here you can store the Appointment in your system
const storeInDb = (data) => console.log('YES!!! New Appointment', data);

const app = express();

// body-parser parsed the body to a json object for us, it also store the rawBody so we can check the request integrity
app.use(bodyParser.json({ verify: (req, res, buf) => (req.rawBody = buf) }));

// security middleware called before all custom commands to verify the integrity of the request
app.use((req, res, next) => {
  // making sure we are using the correct apiKey
  if (req.headers['x-api-key'] !== apiKey) {
    console.error('invalid api key: ', req.headers['x-api-key']);
    return res.status(403).json({ error: 'invalid api key' });
  }

  // check the payload is correctly signed
  const validSignature = chatClient.verifyWebhook(req.body, req.headers['x-signature']);
  if (!validSignature) {
    console.error('invalid signature', req);
    return res.status(403).json({ error: 'invalid signature' });
  }

  // if all good, continute processing the request
  next();
});

app.post('/', (req, res) => {
  const { user, message, form_data } = req.body;
  const isAppointment = message.command === 'appointment'; // you can have up to 50 different custom command

  // first step: user sent an appointment command without any message action being called yet, i.e. without buttons in the mml being clicked
  // we will show a MML input component and ask for user's phone number
  if (isAppointment && !form_data) {
    message.text = ''; // remove user input
    message.type = 'ephemeral'; // switch the message to ephemeral so it's not stored until it's final
    message.mml = `
        <mml type="card">
            <input name="phone" label="Please Enter your phone number" placeholder="e.g. 999-999-9999"></input>
            <button name="action" value="submit">Submit</button>
        </mml>
    `;
  }
  // second step: user has submitted the phone number, we reply with a MML Scheduler component with predefined time slot
  else if (isAppointment && form_data && form_data.phone) {
    const buttonText = `Book ${message.args}`.trim();
    message.phone = form_data.phone; // store temporary data in the message object
    message.mml = `
        <mml type="card">
        <text>Please choose a time slot:</text>
        <scheduler name="appointment" duration="30" interval="30" selected="2021-03-15T10:30:00.000Z" />
        <button name="action" value="reserve" icon="add_alarm">${buttonText}</button>
        </mml>
  `;
  }
  // last step: user has submitted the preferred date
  // we are going to store the appointment in our database and update the message to show AddToCallendar component
  else if (isAppointment && form_data && form_data.action === 'reserve' && form_data.appointment) {
    storeInDb({ phone: message.phone, user: user.id, date: form_data.appointment }); // mock function

    message.type = 'regular'; // switch the message type to regular to make it persistent
    message.phone = undefined; // do not store intermediate value in the message
    const title = `Appointment ${message.args}`.trim();
    const end = new Date(Date.parse(form_data.appointment) + 30 * 60000).toISOString(); // add 30 minutes for the appointment duration
    message.mml = `
        <mml>
            <add_to_calendar
            title="${title}"
            start="${form_data.appointment}"
            end="${end}"
            description="Your appointment with stream"
            location="Stream, Amsterdam"
            />
        </mml>
    `;
  } else {
    message.type = 'error';
    message.text = 'invalid command or input';
  }

  return res.status(200).json({ ...req.body, message }); // reply to Stream with updated message object which updates the message for user
});

const setupTunnelAndWebhook = async () => {
  const { url } = await localtunnel({ port });
  console.log(`Server running remotely in ${url}`);

  // you need to these steps only once in production or manually in stream dashboard
  // https://getstream.io/chat/docs/custom_commands_webhook/
  const cmds = await chatClient.listCommands();
  if (!cmds.commands.find(({ name }) => name === 'appointment')) {
    await chatClient.createCommand({
      name: 'appointment',
      description: 'Create an appointment',
      args: '[description]',
      set: 'mml_commands_set',
    });
  }

  const type = await chatClient.getChannelType('messaging');
  if (!type.commands.find(({ name }) => name === 'appointment')) {
    await chatClient.updateChannelType('messaging', { commands: ['all', 'appointment'] });
  }

  // custom_action_handler_url has to be a publicly accessibly url
  await chatClient.updateAppSettings({ custom_action_handler_url: url });
};

app.listen(port, (err) => {
  if (err) throw err;
  console.log(`Server running in http://127.0.0.1:${port}`);

  setupTunnelAndWebhook();
});
