import cleanPodcastImages from './images';
import cleanEpisodePerson from './episodePerson';
import cleanPodcastSocialInteract from './socialInteract';
import cleanLicense from './license';
import cleanChat from '$lib/Editor/Tags/Chat/cleanChat';
import cleanLiveValue from '$lib/Editor/Tags/LiveValue/cleanLiveValue';
import { get } from 'svelte/store';

import { selectedPodcast, trackerDB } from '$/editor';

let alerted = false;
let confirmed = false;
let trackers;

export default async function cleanItems(data) {
	trackers = (await trackerDB.getItem(`${get(selectedPodcast).url}`)) || { active: [] };
	console.log('trackers: ', trackers);
	if (data.item) {
		for (let item of data.item) {
			await cleanItem(item, data);
		}
	}

	if (data['podcast:liveItem']) {
		data['podcast:liveItem'] = data['podcast:liveItem'].filter((v) => {
			return v?.enclosure?.['@_url'];
		});
		if (data['podcast:liveItem'].length > 0) {
			for (let item of data['podcast:liveItem']) {
				await cleanItem(item);
				await cleanLiveItem(item);
				console.log(item);

				//add cleaners for liveItem
			}
		} else {
			delete data['podcast:liveItem'];
		}
	}
	alerted = false;
	confirmed = false;
}

async function cleanItem(item, data) {
	delete item.sfID;

	handleTrackers(item);
	cleanPodcastSocialInteract(item);
	cleanEpisodePerson(item);
	cleanEpisodeValue(item);
	cleanEpisodeTranscript(item);
	cleanPodcastImages(item);
	cleanLicense(item);
	cleanChat(item);
	cleanLiveValue(item);
	// console.log(item.description);
	// item.description = '<![CDATA[' + item.description + ']]>';
	// console.log(item.description);
	// item['itunes:summary'] = item.description;

	if (!item.author) {
		delete item.author;
	}

	//item['@_status'] filters out liveItem
	if (!item['@_status']) {
		// if (adamFeeds.includes(Number(get(selectedPodcast).id))) {
		// 	await getDuration(item);
		// }

		if (!item.enclosure['@_length']) {
			await getEnclosureLength(item);
		}
		if (!item['itunes:duration']) {
			if (!alerted) {
				alerted = true;
				let text = `Your episodes don't have a duration. This is not strictly necessary, but is nice because it allows an app to display how long your episode is. Depending on how many episode you have, this may take awhile. You can monitor your progress by pressing F12. Would you like to add a duration to your episodes?`;
				if (confirm(text) == true) {
					confirmed = true;
				}
			}
			if (confirmed) {
				if (!item['itunes:duration']) {
					await getDuration(item);
				}
			}
		} else {
			item['itunes:duration'] = Math.round(item['itunes:duration']);
		}
	} else {
		item.enclosure['@_length'] = 33;
		delete item.duration;
		delete item['itunes:duration'];
	}

	if (!item['itunes:image']?.['@_href']) {
		delete item['itunes:image'];
	}

	if (!item['itunes:keywords']) {
		delete item['itunes:keywords'];
	}

	if (!item.link) {
		delete item.link;
	}

	if (!item?.['podcast:chapters']?.['@_url']) {
		delete item['podcast:chapters'];
	}

	//delete when alternateEnclosure is fleshed out
	if (!item?.alternateEnclosure?.['podcast:source']?.['@_uri']) {
		delete item.alternateEnclosure;

		if (item.guid) {
			delete item.guid['@_isPermalink'];
		}
	}

	item['podcast:value'] = item['podcast:value'] || {};
	delete item['podcast:value']['podcast:valueTimeSplits'];

	if (item?.valueTimeSplit) {
		console.log(item?.valueTimeSplit);

		let vts = item?.valueTimeSplit;
		if (vts) {
			console.log(vts);
			let splits = []
				.concat(vts)
				.map((v) => {
					console.log(v);
					let split = {};
					if (v['@_startTime']) {
						split['@_startTime'] = v['@_startTime'];
					} else {
						return;
					}
					if (v['@_duration']) {
						split['@_duration'] = v['@_duration'];
					} else {
						return;
					}
					split['@_remotePercentage'] = v['@_remotePercentage'] || 100;

					if (v['@_feedGuid'] || v?.['podcast:valueRecipient']?.some((v) => v['@_address'])) {
						split['podcast:remoteItem'] = {};
						if (v['@_feedGuid']) {
							console.log(v);
							split['podcast:remoteItem']['@_feedGuid'] = v['@_feedGuid'];
							if (v['@_itemGuid']) {
								split['podcast:remoteItem']['@_itemGuid'] = v['@_itemGuid'];
							}
						} else {
							console.log(v);
							split['podcast:valueRecipient'] = v['podcast:valueRecipient']
								.map((v) => {
									if (v['@_address']) {
										return v;
									}
								})
								.filter((v) => v);
						}

						return v;
					}
				})
				.filter((v) => {
					console.log(v);
					return v;
				});

			if (splits?.length) {
				console.log(splits);

				item['podcast:value']['podcast:valueTimeSplits'] = splits;
			} else {
				delete item['podcast:value']['podcast:valueTimeSplits'];
			}
		}

		delete item?.valueTimeSplit;
	}
}

async function handleTrackers(item) {
	if (trackers?.active?.length) {
		let url = item?.enclosure?.['@_url'];
		if (url.indexOf('http://') == 0) {
			url = url.substring(7);
		}

		if (url.indexOf('https://') == 0) {
			url = url.substring(8);
		}

		let prefix = '';
		let specialPrefix = '';

		trackers.active.forEach((v) => {
			url = url.split(v).join('');
			if (v.slice(-1) !== '/') {
				v = v + '/';
			}
			// If the string is 'ipfspodcasting.net/e', it goes in specialPrefix, else in prefix
			if (v === 'ipfspodcasting.net/e/') {
				specialPrefix = v;
			} else {
				prefix = prefix + v;
			}
		});

		// Add specialPrefix to the end
		prefix = prefix + specialPrefix;

		let newEnclosure = 'https://' + prefix + url;
		item.enclosure['@_url'] = newEnclosure;
	}
}

async function cleanLiveItem(item) {
	if (!item?.['podcast:contentLink']?.['@_href']) {
		delete item['podcast:contentLink'];
	}

	delete item['@_liveValueLink'];

	if (!item['@_chat']) {
		delete item['@_chat'];
	}

	if (!item['@_end']) {
		delete item['@_end'];
	}

	processLiveItemTimes(item);

	if (
		!(item['@_status'] === 'live' || item['@_status'] === 'pending' || item['@_status'] === 'ended')
	) {
		item['@_status'] = 'pending';
	}

	delete item?.['podcast:value']?.['podcast:valueTimeSplit'];
	delete item.valueTimeSplit;
}

function processLiveItemTimes(item) {
	let start = { ...item['@_start'] };
	console.log('-------------------------------');
	if (!start.dateTime) {
		return item;
	}
	let d = new Date(start.dateTime);
	d.setSeconds(0);
	d.setMilliseconds(0);

	let h = start.meridian ? start.hour + 12 : start.hour;
	h = h === 12 ? 0 : h;
	h = h === 24 ? 12 : h;
	d.setHours(h);
	d.setMinutes(start.minute);
	d.setSeconds(0);
	d.setMilliseconds(0);
	let t = d.getTime();
	item['@_start'] = d.toISOString();
	let addTime = Number(start.duration.hour) * 3600000 + Number(start.duration.minute) * 60000;

	item['@_end'] = new Date(t + addTime).toISOString();

	console.log(item['@_start']);
	console.log(item['@_end']);

	console.log('-------------------------------');
	console.log(' ');
}

function cleanEpisodeValue(item) {
	if (item['podcast:value']) {
		item['podcast:value']['podcast:valueRecipient'] = [].concat(
			item['podcast:value']['podcast:valueRecipient']
		);

		item['podcast:value']['podcast:valueRecipient'] = item['podcast:value'][
			'podcast:valueRecipient'
		].filter((v) => {
			if (!v['@_name']) {
				delete v['@_name'];
			}
			if (!v['@_customKey']) {
				delete v['@_customKey'];
			}
			if (!v['@_customValue']) {
				delete v['@_customValue'];
			}
			if (!v['@_fee']) {
				delete v['@_fee'];
			}
			if (!v['@_address'] || !v['@_split']) {
				return false;
			}
			if (v['@_name'] === 'Sovereign Feeds') {
				v['@_address'] = '030a58b8653d32b99200a2334cfe913e51dc7d155aa0116c176657a4f1722677a3';
				v['@_customKey'] = '696969';
				v['@_customValue'] = 'eChoVKtO1KujpAA5HCoB';
			}
			return v;
		});
		if (
			!item?.['podcast:value']?.['podcast:valueRecipient']?.[0]?.['@_address'] ||
			!item?.['podcast:value']?.['podcast:valueRecipient']?.[0]?.['@_split']
		) {
			delete item['podcast:value'];
		}
	}
}

function cleanEpisodeTranscript(item) {
	if (item['podcast:transcript']) {
		item['podcast:transcript'] = [].concat(item['podcast:transcript']).filter((v) => {
			if (!v['@_type'] || !v['@_url']) {
				return false;
			}
			if (!v['@_language']) {
				delete v['@_language'];
			}
			if (!v['@_rel']) {
				delete v['@_rel'];
			}

			return v;
		});
		if (!item['podcast:transcript']?.length) {
			delete item['podcast:transcript'];
		}
	}
}

async function getDuration(item) {
	if (item?.enclosure?.['@_url']) {
		return new Promise((resolve, reject) => {
			// Create a non-dom allocated Audio element
			let a = document.createElement('audio');

			// Define the URL of the MP3 audio file
			a.src = item?.enclosure?.['@_url'];

			a.addEventListener('error', function failed(e) {
				a.remove();
				console.log(e);
				delete item['itunes:duration'];
				resolve();
			});

			// Once the metadata has been loaded, display the duration in the console
			a.addEventListener(
				'loadedmetadata',
				function () {
					let duration = a.duration;
					item['itunes:duration'] = Math.round(duration);

					console.log('The duration of the song is of: ' + item['itunes:duration'] + ' seconds');
					a.remove();
					resolve();
				},
				false
			);
		});
	} else {
		return new Promise((resolve, reject) => {
			delete item['itunes:duration'];
			resolve();
		});
	}
}

async function getEnclosureLength(item) {
	if (item?.enclosure?.['@_url']) {
		try {
			let size = '';

			const response = await fetch(item?.enclosure?.['@_url'], {
				method: 'HEAD'
			});
			if (!response.ok) {
				throw Error(`${response.status} ${response.statusText}`);
			}
			size = response.headers.get('content-length');

			item.enclosure['@_length'] = size;

			console.log(size);
		} catch (error) {
			console.log(error);
			item.enclosure['@_length'] = 0;
		}
	} else {
		delete item.enclosure;
	}
}
