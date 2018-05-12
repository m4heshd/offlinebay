$(document).ready(function () {

    /* Search bar animations
    ----------------------------*/
    $(".top-search__input").on("focus", function () {
        $(".top-search").addClass("top-search--focused");
    }).on("blur", function () {
        let a = $(this).val();
        !a.length > 0 && $(".top-search").removeClass("top-search--focused");
    });
    $(".top-search").on("click", ".top-search__reset", function () {
        $(".top-search").removeClass("top-search--focused");
        $(".top-search__input").val("");
    });

    /* Menu dropdown animations
    ----------------------------*/
    $('.dropdown').on('show.bs.dropdown', function () {
        $(this).find('.dropdown-menu').first().stop(true, true).css({
            opacity: 1,
            transition: 'opacity 0.2s'
        }).slideDown(200);
    }).on('hide.bs.dropdown', function () {
        $(this).find('.dropdown-menu').first().stop(true, true).css({
            opacity: 0,
            transition: 'opacity 0.2s'
        }).slideUp(200);
    });

    /* Modals
    --------------------*/
    /* Blur effect */
    let mdls = $('.modal');
    mdls.on('show.bs.modal', function () {
        $('.body-container').css('filter', 'var(--olEffect)');
    });
    mdls.on('hide.bs.modal', function () {
        $('.body-container').css('filter', '');
    });
    /* Draggable Modal */
    $('.mdl-drag .modal-content').resizable({
        //alsoResize: ".modal-dialog",
        minHeight: 300,
        minWidth: 300
    });
    $('.mdl-drag').draggable({
        handle: '.modal-titlebar'
    });

    /* Data table functions
    ----------------------------*/
    /* tblMain */
    $("#tblMainBody").on('click', 'tr', function () {
        if (!$(this).hasClass('active')) {
            $('#tblMain .active').removeClass('active');
            $(this).addClass('active');
            $('#pnlSeeds').css({
                visibility: 'hidden'
            });
        }
    });
    function resizeHeader() {
        $('th[data-type="date"]').width($('#hdrDate').width());
        $('th[data-type="name"]').width($('#hdrName').width());
        $('th[data-type="size"]').width($('#hdrSize').width());
        $('#tblMain').css('margin-top', '-' + $('#hdrDate').css('height'));
    }
    new ResizeObserver(resizeHeader).observe(hdrDate);

    /* tblTrackers */
    $("#tblTrackers").on('click', 'tr', function () {
        if (!$(this).hasClass('active')) {
            $('#tblTrackers .active').removeClass('active');
            $(this).addClass('active');
        }
    });

});