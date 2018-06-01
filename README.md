<h1 align="center">
  <br>
<img src="https://preview.ibb.co/iBeasd/banner_logo.png" alt="OfflineBay">
  <br>
OfflineBay by <a href="https://www.youtube.com/c/techtac">TechTac</a>
</h1>

Stable version: [**`2.0.0`**](#Release)

OfflineBay is a free and open-source tool created to hold and parse copies of torrent archive dumps. So it allows you to search and download torrents offline. OfflineBay can parse CSV files with many torrenting related added features. The parsing is programmed to match the structure of dump files created by The Pirate Bay. But any group or organization can follow that same structure to create dump files to be used with OfflineBay.

[PLEASE FOLLOW THIS VIDEO TUTORIAL BEFORE YOU START USING OFFLINEBAY](#VIDEO)

### DISCLAIMER:
> **OfflineBay is Free and Open-source software licensed under [MIT License](LICENSE). This software is created to parse CSV dump files created by a third party and any of the data other than this software is not provided by TechTac. Use the data at your own risk. TechTac will not be responsible for any of the data acquired using dump files. It is strongly advised not to use OfflineBay for any copyright infringing activities. OfflineBay will not hide or protect you from authorities if you engage in such activities.**


# Downloads

OfflineBay is distributed as a portable application in favor of the majority. Download the corresponding package and extract the **ZIP** file. All of the packages should have an executable (double-clickable) along with some other files. File named `OfflineBay.exe` or `OfflineBay.app` or `OfflineBay` would be the executable file.

**NOTE:** Linux users may need to declare the file as an executable before running - `chmod +x OfflineBay`

**Why downloads are larger than the previous version?**<br>
Well, OfflineBay 2 is created using [Electron](https://electronjs.org) and NodeJS. So the disk footprint could be a [little concerning](https://github.com/electron/electron/issues/2003).  There is no way around this issue. This is one small compromise for a lot of improvements.

 - [All releases (with source)](#Release)
 - Windows (x86 & x64) - [Download](#DL)
 - MacOS - [Download](#DL)
 - Linux (x64) - [Download](#DL)
 - Linux (x86) - [Download](#DL)

**WARNING:** Since OfflineBay is now open-source you could stumble upon some modified versions of OfflineBay. If you get infected with malware by going off the proper channels, i won't take any blame for them.

If you're looking for the older version of OfflineBay, Downloads are available [here](https://pirates-forum.org/Thread-Release-OfflineBay-1-0-2-Download-torrents-from-thePirateBay-offline).

**How to remove OfflineBay?** <br>
I personally believe that none of the applications should leave any residue in the removal process. Unlike other portable apps OfflineBay will not leave anything behind once you hit delete on the application folder. It's valid for all platforms. Everything will be removed including Dump files, configurations and error logs.

# Build OfflineBay yourself

You will need [NodeJS](https://nodejs.org) and [NPM](https://www.npmjs.com/) (Usually packed with NodeJS) installed on your computer to build OfflineBay yourself.

**NOTE:** When creating OfflineBay i almost managed to completely avoid native modules. But there's a single module named `bufferutil` that's required by another module. You may run into a few errors when building if you don't have platform build tools for `node-gyp`. You can simply ignore those errors since the module is an optional dependency. Also since OfflineBay practically has no native dependencies, it's possible to cross-build without any complications. But i cannot guarantee on the outcome.

Clone this repository, `cd` to that directory and run `npm run clean` before everything. Then run any of  the following commands to build OfflineBay.

 - Windows (x86 & x64) - `npm run dist-win`
 - MacOS - `npm run dist-mac`
 - Linux (x64) - `npm run dist-linux-64`
 - Linux (x86) - `npm run dist-linux-32`

# Support OfflineBay project

Involvement as a contributor by adding a few lines of code, fixing a bug, respond to issues, testing etc.. would be one of the most helpful methods you could support the project. If you're not a programmer but a creative person, you could definitely get involved in the GUI part of OfflineBay. [Follow this link to learn about theming for OfflineBay](#Themes).
If you have some spare coins laying around, you could throw some this way to buy me a coffee..

 - **BTC:** 12d9qz6bzL6tiB4oeX595oEo9ENMTEzF5y
 - **ETH:** 0xe84CBc4B4C64c6800619942172F93dcfb1030972
 - **BCH:** qqguu77ylq7p72m02ksv78jyzy86vtk6jqtrrc40r3

Since i'm also a video creator on YouTube, you can also give me some support by [Subscribing to my channel](https://www.youtube.com/c/techtac?sub_confirmation=1) and sharing some of my [videos](https://www.youtube.com/c/techtac/videos).

<a href="https://www.youtube.com/c/techtac?sub_confirmation=1"><img src="https://image.ibb.co/ct1idJ/yt_sub.png" alt="Subscribe to TechTac" border="0"></a>

You can also support me on [Patreon](https://www.patreon.com/techtac) by becoming a Patron.

<a href="https://www.patreon.com/techtac"><img src="https://image.ibb.co/iXg25y/patreon.png" alt="Be a Patron" border="0"></a>

# Got an Issue?

[Follow this link](#Issues) to submit your issues. Remember to be descriptive when submitting issues. Also remember that issues area is not meant to ask for help. If you need help or you have any other questions regarding OfflineBay you can simply fire up a conversation on the [Suprbay thread](#Suprbay).
# Known issues

**Linux:**

 - Splash window may have a [white background instead of transparency](https://github.com/electron/electron/issues/2170) [`unfixable/SW-HW dependent`]
 - DHT scraping may not work sometimes [`unable to trace the issue`]

# Themes you say?

You can create themes for OfflineBay just using CSS. [This repository](#Themes) is dedicated to OfflineBay themes. Visit there to learn more about creating themes.

If you're a regular user, you can also follow the [same repository](#Themes) to download themes.

# Changelog

Complete Changelog is available [here](changelog.txt).

# License
OfflineBay is licensed under [MIT License](LICENSE). So you are allowed to use freely and modify the application. I will not be responsible for any outcome. Proceed with any action at your own risk.
