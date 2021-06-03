import axios from 'axios';

( async () => {
    const keywords = [
        "code enforcement search",
        "site:.gov code enforcement",
        "site:.gov building violation",
        "site:.gov code violation"
    ];

    for (const keyword of keywords) {
        let limit = 10;
        let offset = 0;
        console.log(keyword)
        while (true) {
            const url = `https://www.opendatanetwork.com/search-results?limit=${limit}&offset=${offset}&q=${keyword}`;
            // console.log(`url = ${url}`);
            try {
                const response = await axios.get(url);
                if (response.status === 200) {
                    const {data} = response;
                    const api_regexp = /(?<=api-link href=)[a-zA-Z:\/.0-9-]+/gm;
                    const title_regexp = /(?<=<h2>).+?(?=h2><a)/gm;
                    const apis = data.match(api_regexp);
                    const titles = data.match(title_regexp);
                    if (apis.length === titles.length) {
                        for (let i = 0 ; i < apis.length ; i++) {
                            const api = apis[i];
                            const title = titles[i];
                            if (title.match(/code.*enforcement/i) || title.match(/code.*violation/i) || title.match(/building.*enforcement/i)) {
                                console.log(api +' => ' + title);
                            }
                        }
                    }
                }
                else {
                    break;
                }
            } catch (error) {
                
            }
            offset += limit;
            console.log('=================== ', offset)
        }
    }

    process.exit();
})();