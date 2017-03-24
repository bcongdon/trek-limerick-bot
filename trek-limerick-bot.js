#!/usr/bin/env node
'use strict';

const program = require('commander');
const rhyme = require('rhyme');
const fs = require('fs');
const Tokenizer = require('sentence-tokenizer');
const glob = require("glob");
const async = require("async");
const mkdirp = require('mkdirp');
var _ = require('lodash');

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
  return str.replace(/[^a-zA-Z ]+/g, '').replace('/ {2,}/',' ');
}

function sentenceSyllables(r, str) {
  return str.split(' ').reduce(function(acc, val) {
    val = cleanWord(val);
    return acc + r.syllables(val);
  }, 0)
}

function lastWord(sent) {
  return cleanWord(_.last(sent.split(' ')).toLowerCase());
}

function rhymeKey(r, sent) {
  return r.rhyme(lastWord(sent))[0];
}

function generateLimerickData(data, cb) {
  var script = JSON.parse(data);
  var sentence_script = scriptToSentences(script);
  rhyme(function(r) {
    sentence_script.forEach(function(d) {
      d.syllables = sentenceSyllables(r, d.line);
    })
    var selected = sentence_script.filter(function(d) {return d.syllables == 6 || d.syllables == 9});
    selected = selected.map(function(d){
      d.key = rhymeKey(r, d.line);
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
  mkdirp('processed/', function(err) {
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
          cb();
        });
      });
    });
  })
}

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

program
  .command('generate')
  .description('Generate a limerick')
  .action(function() {
    glob("processed/*.json", function(er, files) {
      var data = {};
      files.forEach(function(fpath){
        var newData = JSON.parse(fs.readFileSync(fpath));
        var oldsum = keyCount(data);
        var newsum = keyCount(newData)
        data = _.mergeWith(data, newData, merger);
      });
      console.log(generateLimerick(data).map(function(d){return d.line}).join('\n'));
    });
  });

program.parse(process.argv);
