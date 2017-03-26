# tng-limerick-bot
> 🖖 Limericks from Star Trek Scripts

See it in action: https://twitter.com/TrekLimerickBot

## Configuration

1. Copy the `.env` template

    ```
    cp .env.template .env
    ```

2. [Create](https://apps.twitter.com/) a Twitter app and note your credentials.
3. Use the credentials from the last step to fill in the following fields in  `.env`:
    * `CONSUMER_KEY`
    * `CONSUMER_SECRET`
    * `ACCESS_TOKEN`
    * `ACCESS_TOKEN_SECRET`

## Creating Rhyme Database

1. Create a set of parsed Star Trek scripts using [tng-parser](https://github.com/bcongdon/Scripts/tree/master/tng-parser).
2. Place this set of parsed scripts in a new `scripts/` directory.
3. Run `./trek-limerick-bot.js process`, and the scripts will be converted and placed into `processed/`,
4. Now you can run the `generate` and `post` commands, and `trek-limerick-bot.js` will use the processed scripts.

## Usage

### Local Usage

First, install dependencies:

```
npm install
```

Local usage:
```
Usage: trek-limerick-bot [options] [command]


Commands:

process    Processes scripts in "scripts/"
generate   Generate a limerick
post       Post a limerick as a tweet stream

Options:

-h, --help  output usage information
```

Example:

```
$ ./trek-limerick-bot.js generate

He is protected by a force field...
So someone did sabotage the shield...
I got the com panel...
They have closed the channel.
that proud core of him that would not yield...
```

### AWS Lambda Deployment

1. Build the .zip package:

    ```
    npm run package
    ```

2. Upload `./dist/trek-limerick-bot.zip` to Lambda
3. Setup a CloudWatch Schedule with a `rate(1 hour)` activation schedule.
