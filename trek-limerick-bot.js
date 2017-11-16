#!/usr/bin/env node
'use strict';

const async = require("async");
const botUtilities = require('bot-utilities');
const fs = require('fs');
const glob = require("glob");
const mkdirp = require('mkdirp');
const program = require('commander');
const rhyme = require('rhyme');
const Tokenizer = require('sentence-tokenizer');
const Twit = require('twit');
const customWords = require('./custom_phrases.json');
const text2png = require('text2png');
var _ = require('lodash');

require('dotenv').config({path: __dirname + '/.env'});
_.mixin(botUtilities.lodashMixins);
_.mixin(Twit.prototype, botUtilities.twitMixins);

function scriptToSentences(script) {
  var tokenizer = new Tokenizer('script');
  return _.flatten(script.map(function(dialogue) {
    if(!dialogue.line)
      return [];
    tokenizer.setEntry(dialogue.line);
    return tokenizer.getSentences().map(function(sentence) {
      return {
        actor: dialogue.actor,
        line: sentence
      }
    })
  }));
}

function cleanWord(str) {
  return str.toLowerCase()
            .replace(/^[^a-zA-Z ]+/g, '')
            .replace(/[^a-zA-Z ]+$/g, '')
            .replace('/ {2,}/',' ');
}

function cleanSentence(str) {
  return str.replace(/\.\.\.|-/g, ' ');
}

function rhymeKeyForWord(r, str) {
  str = cleanWord(str);
  var singular = str.replace(/\'?s$/, '');
  if(str in customWords)
    return customWords[str].rhyme;
  else if(r.rhyme(str)[0])
    return r.rhyme(str)[0];
  else if(str != singular && rhymeKeyForWord(r, singular))
    return rhymeKeyForWord(r, singular) + "S";
}

function syllablesForWord(r, str) {
  str = cleanWord(str);
  var singular = str.replace(/\'?s$/, '');
  if(str in customWords)
    return customWords[str].syllables;
  else if(r.syllables(str))
    return r.syllables(str);
  else if(str != singular && syllablesForWord(r, singular))
    return syllablesForWord(r, singular);
}

var unknown = {}

function sentenceSyllables(r, str) {
  str = cleanSentence(str);
  return str.split(/\s/).reduce(function(acc, val) {
    val = cleanWord(val);
    if(val == "")
      return acc;
    if(isNaN(syllablesForWord(r, val))) {
      unknown[val] = val in unknown ? unknown[val] + 1 : 1;
    }
    return acc + syllablesForWord(r, val);
  }, 0)
}

function lastWord(sent) {
  return cleanWord(_.last(sent.split(/\s/)));
}

function rhymeKey(r, sent) {
  return rhymeKeyForWord(r, lastWord(sent));
}

function generateLimerickData(data, cb) {
  var script = JSON.parse(data);
  var sentence_script = scriptToSentences(script);
  rhyme(function(r) {
    sentence_script.forEach(function(d) {
      d.syllables = sentenceSyllables(r, d.line);
    });
    var selected = sentence_script.filter(function(d) {return d.syllables == 6 || d.syllables == 9});
    selected = selected.map(function(d){
      d.key = rhymeKey(r, d.line);
      if(!d.key) {
        var k = lastWord(d.line);
        unknown[k] = k in unknown ? unknown[k] + 1 : 1;
      }
      return d;
    }).filter(function(d){ return d.key; });
    cb(selected);
  });
}

function groupByKey(lines) {
  var out = {}
  lines.forEach(function(l) {
    if(l.key in out){
      out[l.key].push(l);
    }
    else{
      out[l.key] = [l];
    }
  });
  return out;
}

function categorizeLimerickLines(lines) {
  return {
    sixes: groupByKey(lines.filter(function(l) {return l.syllables == 6})),
    nines: groupByKey(lines.filter(function(l) {return l.syllables == 9}))
  }
}

function processScriptFile(fpath, cb) {
  mkdirp(__dirname + '/processed/', function(err) {
    if(err) throw err;
    var data = fs.readFile(fpath, function(err, data) {
      if(err) throw err;
      generateLimerickData(data, function(processed) {
        var fname = fpath.replace(/^.*[\\\/]/, '');
        var new_fpath = './processed/' + fname;
        processed = categorizeLimerickLines(processed);
        fs.writeFile(new_fpath, JSON.stringify(processed), function(err) {
          if(err) console.log(err);
          else console.log("Saved: " + new_fpath);
          console.log(_.chain(unknown).map(function(d, k) {
            return {word: k, count: d}
          }).sortBy('count').reverse().value());
          cb();
        });
      });
    });
  })
}

function keyCount(d) {
  var sum = 0;
  for(var key in d.nines){
    sum += d.nines[key].length;
  }
  return sum;
}

function merger(objValue, srcValue) {
  if (_.isArray(objValue)) {
    return objValue.concat(srcValue);
  }
}

function regroupByKey(lines) {
  lines.forEach(function(elem) {
    elem.key = lastWord(elem.line);
  });
  return groupByKey(lines);
}

function trySelectUnique(rhymes, num) {
  var taken = [];
  rhymes = _.shuffle(rhymes);
  for(var i = 0; i < num; i++) {
    if(rhymes[i].length > 1)
      rhymes[i] = _.shuffle(rhymes[i]);
    taken.push(rhymes[i][0]);
  }
  return taken;
}

function generateLimerick(data) {
  var all_n = _.shuffle(_.filter(data.nines, function(category) {
    return category.length >= 3;
  })).map(regroupByKey)
     .filter(function(c) {return _.size(c) >= 3});
  var all_s = _.shuffle(_.filter(data.sixes, function(category) {
    return category.length >= 2;
  })).map(regroupByKey)
     .filter(function(c) {return _.size(c) >= 2});
  var n = trySelectUnique(_.shuffle(all_n)[0], 3);
  var s = trySelectUnique(_.shuffle(all_s)[0], 2);
  return [n[0], n[1], s[0], s[1], n[2]]
}

function splitIntoTweets(lines) {
  var tweets = [];
  var curr_line = '';
  for(var i = 0; i < lines.length; i++) {
    var str = lines[i].line;
    if(str.length + curr_line.length >= 139) {
      tweets.push(curr_line);
      curr_line = '';
    }
    if(curr_line.length > 0)
      curr_line += '\n'
    curr_line += str;
  }
  if(curr_line.length > 0)
    tweets.push(curr_line)
  return tweets;
}

function getData(cb) {
  glob(__dirname + "/processed/*.json", function(er, files) {
    var data = {};
    files.forEach(function(fpath){
      try {
        var newData = JSON.parse(fs.readFileSync(fpath));
        var oldsum = keyCount(data);
        var newsum = keyCount(newData)
        data = _.mergeWith(data, newData, merger);
      }
      catch(e) {
        console.log("Failed to load: " + fpath);
      }
    });
    cb(data);
  });
}

function textToImage(str) {
  return text2png(str, {
    font: '80px Helvetica Neue',
    textColor: 'black',
    bgColor: 'white',
    lineSpacing: 25,
    padding: 20});
}

function postLimerick(cb) {
  getData(function(data) {
    var limerick = generateLimerick(data);
    var l_str = limerick.map(function(d){return d.line}).join('\n');
    var T = new Twit(botUtilities.getTwitterAuthFromEnv());
    if(l_str.length < 280) {
      T.post('statuses/update', { status: l_str }, function(err, data, resp) {
        console.log("Posted successfully.");
        if(cb) cb();
      });
    }
    else {
      var b64Data = textToImage(l_str).toString('base64');
      T.post('media/upload', { media_data: b64Data }, function(err, data, res) {
        if(err) throw err;
        var mediaIdStr = data.media_id_string;
        var altText = l_str;
        var meta_params = {
          media_id: mediaIdStr, 
          alt_text: {
            text: altText
          }
        };
        T.post('media/metadata/create', meta_params, function (err, data, response) {
          if(err) throw err;
          var randomEmoji = _.shuffle(['🖖', '👽', '🤖', '🕵', '👾', '🚀'])[0];
          var params = { status: randomEmoji + '👇', media_ids: [mediaIdStr] };
          T.post('statuses/update', params, function (err, data, response) {
            console.log("Posted successfully.");
            if(cb) cb();
          });
        });
      });
    }
  });
}

program
  .command('post')
  .description('Post a limerick as a tweet stream')
  .action(function() {
    postLimerick();
  });

program
  .command('rhyme')
  .description('Gives the rhyme keyword of a word')
  .action(function(word) {
    rhyme(function(r) {
      console.log("Rhyme Keyword: " + rhymeKeyForWord(r, word));
    });
  });

program
  .command('syllables')
  .description('Gives the syllables of a word')
  .action(function(word) {
    rhyme(function(r) {
      console.log("Syllables: " + syllablesForWord(r, word));
    });
  });

program
  .command('generate')
  .description('Generate a limerick')
  .option('-o, --out <file>', 'Output limerick to image')
  .action(function(opts) {
    getData(function(data) {
      var limerick = generateLimerick(data);
      var l_str = limerick.map(function(d){return d.line}).join('\n');
      console.log(l_str);
      if(opts.out)
        fs.writeFileSync(opts.out, textToImage(l_str));
    });
  });

program
  .command('process')
  .description('Processes scripts in "scripts/"')
  .action(function() {
    glob("scripts/*.json", function(er, files) {
      async.forEachOfLimit(files, 3, function(fname, key, cb) {
        console.log("Processing: " + fname);
        processScriptFile(fname, cb);
      });
    });
  });

program.parse(process.argv);

exports.handler = function(event, context) {
  postLimerick(function() {
    context.succeed();
  });
}
