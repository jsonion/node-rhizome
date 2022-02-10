import isAbsoluteUrl from 'is-absolute-url';

var wordHistogram = [];

var toHistogram = function (objectType, dataNode, index, ctx = {}) {
  var result = 0, buffer = 0;

  switch (objectType) {
    case 'post':
      if (typeof dataNode.post !== 'undefined')
        result = updateWordHistogram(dataNode.post, 'posts', index, '.post');
      break;

    case 'comment':
      if (typeof dataNode.comment !== 'undefined' && 
          typeof ctx.displayName !== 'undefined' &&
          dataNode.author == ctx.displayName) {
        result = updateWordHistogram(dataNode.comment, 'comments', index, '.comment');
      }
      break;

    case 'joinedEvent':
      if (typeof dataNode.name !== 'undefined')
        result = updateWordHistogram(dataNode.name, 'event_responses', index, '.name');
      break;

    case 'yourEvent':
      if (typeof dataNode.name !== 'undefined')
        result = updateWordHistogram(dataNode.name, 'your_events', index, '.name');
      if (typeof dataNode.description !== 'undefined')
        result = updateWordHistogram(dataNode.description, 'your_events', index, '.description');
      break;
  }

  if (objectType == ('comment' || 'post') && 
      typeof dataNode['attachments'] !== 'undefined' &&
      typeof dataNode['attachments'][0]['media'] !== 'undefined') {
    
    if (typeof dataNode['attachments'][0]['media'].title !== 'undefined' &&
        dataNode['attachments'][0]['media'].title.length) {
      var string = dataNode['attachments'][0]['media'].title;

      if (objectType == 'post')
        buffer = updateWordHistogram(string, 'posts', index, '.attachments #0 .media .title');

      if (objectType == 'comment')
        buffer = updateWordHistogram(string, 'comments', index, '.attachments #0 .media .title');

      if (buffer)
        result = result + buffer;
    }

    if (typeof dataNode['attachments'][0]['media'].description !== 'undefined' &&
        dataNode['attachments'][0]['media'].description.length) {
      var string = dataNode['attachments'][0]['media'].description;

      if (objectType == 'post' && 
          dataNode['attachments'][0]['media'].description != dataNode.post)
        buffer = updateWordHistogram(string, 'posts', index, '.attachments #0 .media .title');

      if (objectType == 'comment' && 
          dataNode['attachments'][0]['media'].description != dataNode.comment)
        buffer = updateWordHistogram(string, 'comments', index, '.attachments #0 .media .description');

      if (buffer)
        result = result + buffer;
    }     
  }

  return { wordCount: result }
}

var updateWordHistogram = (string, collection, index, path) => {
  var splitByRegex = /(?:\n|\r|\.\ |\?\ |\:\ |\=\ |\,\ |\[\ |\]\ |\ \-\ |\ |\!|\;|\$|\"|–|\—|\(|\)|\.\.\.|\…)/g,
      urlSafeRegex = /[\.\?\:\=\,\[\]]/g,
      wordsBeforeUrl,
      wordsAfterUrl,
      extendCount;
  
  wordsBeforeUrl = string.split(splitByRegex);
  extendCount = wordsBeforeUrl.length;
  wordsBeforeUrl.forEach(word => {

    if (word.indexOf("/") !== -1 ||
        word.indexOf(".") !== -1) {
      var isUrl = word;

      if (word.indexOf("http") === -1)
        isUrl = "https://"+word;

      if (isAbsoluteUrl(isUrl))
        return false;
    }

    wordsAfterUrl = word.split(urlSafeRegex);
    extendCount += wordsAfterUrl.length - 1; // [!!!]

    wordsAfterUrl.forEach(word => {

      if (word.indexOf("#") == 0) {
        if (word.indexOf("##") != -1 || 
            word.length == 1 ||
            Number.isInteger(word.substring(1) / 1))
          return false;
      } else
        word = word.toLowerCase().trim();

      if (word.length) {
        var word_x = wordHistogram.findIndex((object) => {
          if (typeof object.keyword === 'string' && object.keyword === word)
            return true;
        });

        if (word_x !== -1) {
          wordHistogram[word_x]['n'] = wordHistogram[word_x]['n'] + 1;

          if (typeof wordHistogram[word_x]['ref'][collection] === 'object') {
            var key_x = wordHistogram[word_x]['ref'][collection].findIndex((object) => {
              if (typeof object.i === 'number' && object.i == index)
                return true;
            });

            if (key_x != -1) {
              wordHistogram[word_x]['ref'][collection][key_x].n = 
                wordHistogram[word_x]['ref'][collection][key_x].n + 1;
            } else
              wordHistogram[word_x]['ref'][collection].push({i: index, n: 1});
          } else
            wordHistogram[word_x]['ref'][collection] = [{i: index, n: 1}];
        } else
          wordHistogram.push({ keyword: word, n: 1, ref: {[collection]: [{i: index, n: 1}]} });
      }
    });
  });

  return { wordCount: extendCount }
}

export { toHistogram, wordHistogram }