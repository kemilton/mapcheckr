const SV = new google.maps.StreetViewService();

export default function SVreq(loc, settings) {
    return new Promise(async (resolve, reject) => {
        let callback = async (res, status) => {
            if (status != google.maps.StreetViewStatus.OK) return reject({ ...loc, reason: "sv not found" });

            if (settings.rejectUnofficial) {
                if (res.location.pano.length != 22) return reject({ ...loc, reason: "unofficial coverage" });
                if (settings.rejectNoDescription && !res.location.description && !res.location.shortDescription)
                    return reject({ ...loc, reason: "no description" });
                if (settings.rejectNoIntersection){
					if(settings.checkLinkedPanos){
						let newRes = await searchIntersection(res, 0, 0, settings.numOfLinkedPanos);
						if(newRes == null) return reject({ ...loc, reason: "no intersection" });
						res = newRes;
					}else{
						if (res.links.length < 3) return reject({ ...loc, reason: "no intersection" });
					}
				}
			}
			if (settings.rejectGen1 && res.tiles.worldSize.height === 1664) {
				return reject({ ...loc, reason: "blurry gen 1" });
            }

            if (settings.rejectGen1 && res.tiles.worldSize.height === 1664) {
                return reject({ ...loc, reason: "gen 1" });
            }

            if (
                Date.parse(res.imageDate) < Date.parse(settings.fromDate) ||
                Date.parse(res.imageDate) > Date.parse(settings.toDate)
            ) {
                return reject({ ...loc, reason: "out of date" });
            }

            // To check, returns broken links for panoID locations
            // if (res.links.length === 0) return reject({ ...loc, reason: "no link found" });

            if (settings.setHeading && loc.heading === 0) {
                loc.heading = parseInt(res.links[0].heading);
                if (settings.randomHeadingDeviation) {
                    loc.heading += randomInRange(-settings.headingDeviation, settings.headingDeviation);
                } else {
                    loc.heading += randomSign() * settings.headingDeviation;
                }
            }

            if (settings.updateHeading) {
                if (settings.randomHeadingDeviation) {
                    loc.heading =
                        getNearestHeading(res.links, loc.heading) +
                        randomInRange(-settings.headingDeviation, settings.headingDeviation);
                } else {
                    const arr = res.links.flatMap((link) => [
                        link.heading + settings.headingDeviation,
                        link.heading - settings.headingDeviation,
                    ]);

                    const newHeading = closest(arr, loc.heading);
                    loc.heading = newHeading;
                }
            }

            if (settings.adjustPitch) {
                loc.pitch = settings.pitchDeviation;
            }

            if (settings.fixMisplaced) {
                loc.lat = res.location.latLng.lat();
                loc.lng = res.location.latLng.lng();
            }

            if (settings.addPanoId) {
				if (settings.keepExistingPanoId){
					if (loc.panoId == null){
						loc.panoId = res.location.pano;
					}
				} else {
					loc.panoId = res.location.pano;
				}
			}

            if (settings.getLatestPano) {
                loc.panoId = res.time[res.time.length - 1].pano;
            }

            resolve(loc);
        };

        if (!loc.panoId) {
            await SV.getPanoramaByLocation(new google.maps.LatLng(loc.lat, loc.lng), settings.radius, callback).catch(
                (e) => reject({ loc, reason: e.message })
            );
        } else {
            await SV.getPanoramaById(loc.panoId, callback).catch((e) => reject({ loc, reason: e.message }));
        }
    });
}
const randomSign = () => (Math.random() >= 0.5 ? 1 : -1);

const closest = (arr, num) => arr.reduce((a, b) => (Math.abs(b - num) < Math.abs(a - num) ? b : a));

const difference = (a, b) => {
    const d = Math.abs(a - b);
    return d > 180 ? 360 - d : d;
};

const getNearestHeading = (bs, a) => {
    const ds = bs.map((b) => difference(a, b.heading));
    return bs[ds.indexOf(Math.min.apply(null, ds))].heading;
};

const randomInRange = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const searchIntersection = async (res, heading, depth, maxdepth) => {
	if (depth > maxdepth) return null;
	if (res.links.length >= 3) return res;
	if (depth == 0){
		for (var i=0; i<res.links.length; i++){
			let newRes = await SV.getPanoramaById(res.links[i].pano, () => {} );
			let intersection = await searchIntersection(newRes.data, res.links[i].heading, depth+1, maxdepth);
			if(intersection != null) return intersection;
		}
	}else{
		//先程まで進んだ1つのみを選択
		let index = await moveToHeading(res, heading)
		let target = res.links[index]
		let newRes = await SV.getPanoramaById(target.pano, () => {} );
		let intersection = await searchIntersection(newRes.data, target.heading, depth+1, maxdepth);
		if(intersection != null) return intersection;
	}
	return null;
}

const moveToHeading = async (res, heading) => {
	let val = 360;
	let target = 0;
	res.links.forEach(function (element, index) {
		let ans = Math.abs(heading - element.heading);
		if (val > ans) {
			val = ans;
			target = index;
		}
	});
	return target;
}